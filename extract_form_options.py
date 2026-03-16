#!/usr/bin/env python3
"""Extract dropdown options from Greenhouse job application form."""
import asyncio
import json
import re
from playwright.async_api import async_playwright

URL = "https://job-boards.greenhouse.io/sparksoftcorporation/jobs/5077868007"

def is_country_option(s: str) -> bool:
    """Country options have format 'CountryName+NNN' (phone code)."""
    return re.match(r".+\+\d{1,4}$", s) is not None

async def get_dropdown_options(page, label_text: str, exclude_countries: bool = True) -> list[str]:
    """Click a label's associated control, wait for options, return options."""
    try:
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)
        label = page.locator(f"label:has-text('{re.escape(label_text)}')").first
        await label.scroll_into_view_if_needed(timeout=3000)
        await label.wait_for(state="visible", timeout=2000)
        for_id = await label.get_attribute("for")
        if not for_id:
            return []
        control = page.locator(f"#{re.escape(for_id)}").first
        await control.scroll_into_view_if_needed(timeout=3000)
        await control.click()
        await page.wait_for_timeout(600)
        opts = await page.locator("[role='option'], [id*='-option-']").all()
        options = []
        for o in opts:
            v = await o.text_content()
            if v and (t := v.strip()):
                if exclude_countries and is_country_option(t):
                    continue
                options.append(t)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(300)
        return options
    except Exception:
        return []

async def extract_options():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(URL, wait_until="networkidle")
        await page.wait_for_timeout(2000)

        results = {}

        for label_text in [
            "Gender",
            "Are you Hispanic/Latino?",
            "Veteran Status",
            "Disability Status",
        ]:
            opts = await get_dropdown_options(page, label_text)
            if opts:
                results[label_text] = opts

        # Race & Ethnicity - might be a separate field
        for rl in ["Race & Ethnicity", "Race", "Ethnicity"]:
            opts = await get_dropdown_options(page, rl)
            if opts:
                results[rl] = opts
                break

        # Country dropdown - include country options (format: Name+code)
        try:
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(200)
            label = page.locator("label:has-text('Country')").first
            await label.scroll_into_view_if_needed(timeout=3000)
            for_id = await label.get_attribute("for")
            if for_id:
                control = page.locator(f"#{re.escape(for_id)}").first
                await control.click()
                await page.wait_for_timeout(600)
                opts = await page.locator("[role='option'], [id*='-option-']").all()
                country_opts = []
                for o in opts:
                    v = await o.text_content()
                    if v and v.strip():
                        country_opts.append(v.strip())
                if country_opts:
                    results["Country (sample)"] = country_opts[:5]
                await page.keyboard.press("Escape")
        except Exception:
            pass

        results["_Country_Phone_Location"] = (
            "Country: dropdown with country names + phone codes (e.g. 'United States+1'). "
            "Phone: text input. Location (City): text input with 'Locate me' button (Google Places autocomplete)."
        )

        await browser.close()
        return results

if __name__ == "__main__":
    r = asyncio.run(extract_options())
    print(json.dumps(r, indent=2))
