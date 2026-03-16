"""
Agentic Job Application Bot — V5 (Greenhouse / Lever)

Launches a visible Chromium browser, navigates to a job application page,
extracts a structured field list with BeautifulSoup, sends it to GPT-4o
to plan fill actions, then uses Playwright to execute them — auto-detecting
React Select dropdowns, location autocompletes, native selects, and
checkboxes at runtime. Supports resume/CV file upload.

Usage:
    python apply_agent.py <job_url>
    python apply_agent.py <job_url> --resume path/to/resume.pdf
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from playwright.async_api import async_playwright, Page
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate

load_dotenv()

# ---------------------------------------------------------------------------
# Candidate profile
# ---------------------------------------------------------------------------
CANDIDATE = {
    "first_name": "Zaid",
    "last_name": "Mahrouq",
    "email": "zaidmahrouq15@gmail.com",
    "phone": "(817) 946-8362",
    "country_code": "US",
    "country": "United States",
    "country_of_residence": "United States",
    "state": "Texas",
    "city": "Arlington",
    "linkedin": "N/A",
    "github": "",
    "portfolio": "",
    "years_experience": "8",
    "highest_education": "Bachelor's Degree",
    "salary_range": "$120,000 - $140,000",
    "authorized_to_work_us": "Yes",
    "require_sponsorship": "No",
    "currently_working_here": "No",
    "willing_drug_test_background_check": "Yes",
    "security_clearance": "Yes - Active Public Trust clearance",
    "worked_here_before": "No",
    "lived_in_us_3_of_5_years": "Yes",
    "certify_information_true": True,
    "agree_to_privacy_policy_and_data_processing": "Yes",
    "I_agree_to_the_processing_of_my_personal_data": "Yes",
    # Voluntary self-identification (EEO) — exact Greenhouse option text
    "gender": "Male",
    "hispanic_latino": "No",
    "race_ethnicity": "Asian",
    "veteran_status": "I am not a protected veteran",
    "disability_status": "No, I do not have a disability and have not had one in the past",
}

TEST_URL = "https://boards.greenhouse.io/example/jobs/12345"


# ---------------------------------------------------------------------------
# Structured field extraction
# ---------------------------------------------------------------------------
def extract_form_fields(raw_html: str) -> str:
    """Parse form HTML into a compact field list for the LLM."""
    soup = BeautifulSoup(raw_html, "html.parser")
    fields: list[dict] = []
    seen_ids: set[str] = set()

    for label in soup.find_all("label"):
        text = label.get_text(" ", strip=True)
        if not text or len(text) > 300:
            continue

        for_attr = label.get("for", "")
        field: dict = {"label": text}

        if for_attr:
            field["for_id"] = for_attr
            seen_ids.add(for_attr)

        fields.append(field)

    for cb in soup.find_all("input", {"type": "checkbox"}):
        cb_id = cb.get("id", "")
        if cb_id in seen_ids:
            continue
        parent = cb.parent
        if not parent:
            continue
        text = parent.get_text(" ", strip=True)
        if text:
            fields.append({"label": text, "for_id": cb_id, "type": "checkbox"})
            seen_ids.add(cb_id)

    return json.dumps(fields, indent=2)


# ---------------------------------------------------------------------------
# LLM prompt
# ---------------------------------------------------------------------------
LLM_PROMPT = """\
You are an expert at filling out job application forms.

You receive a list of form fields and candidate data, both as JSON.
Return a JSON **array** of actions to fill the form, in field order.

## Action format
Each action is an object:
- "action": "fill" or "check"
- "for_id": the field's for_id (from the field list)
- "label": the field's exact label text (from the field list)
- "value": the text/option to enter (omit for "check")

## Rules
- Emit ONE action per field you can match to candidate data.
- Use "fill" for text fields AND dropdowns (the bot auto-detects the type at runtime).
- Use "check" for checkboxes.
- For yes/no dropdown questions, set "value" to the candidate's answer (e.g. "Yes").
- For the certification/acknowledgment checkbox, use "check".
- For EEO/voluntary self-identification fields, use the candidate's exact values.
- For privacy policy / data processing agreement fields, use "Yes" as the value.
- For race/ethnicity fields, use the candidate's race_ethnicity value exactly.
- Match flexibly: "agree_privacy_policy" matches any field about agreeing to privacy/data policy.
- Match flexibly: "authorized_to_work_us" matches any field about work authorization.
- Match flexibly: "currently_working_here" matches "Are you currently working at [company]?"
- Match flexibly: "worked_here_before" matches "Have you ever been employed by [company]?"
- Skip any field with no matching candidate data.
- Skip file upload fields (resume/CV, cover letter).
- Return ONLY a valid JSON array. No markdown, no commentary.

## Form Fields
```json
{fields}
```

## Candidate Data
```json
{resume}
```
"""


async def plan_actions(html_content: str, candidate: dict) -> list[dict]:
    """Extract fields, send to LLM, return action plan."""

    fields_json = extract_form_fields(html_content)
    field_list = json.loads(fields_json)
    print(f"📄 Extracted {len(field_list)} fields ({len(fields_json):,} chars from {len(html_content):,})")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("⚠️  OPENAI_API_KEY not set — using hardcoded fallback")
        return _fallback(candidate)

    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    prompt = PromptTemplate.from_template(LLM_PROMPT)
    chain = prompt | llm

    print("🧠 LangChain analyzing fields...")
    result = await chain.ainvoke({
        "fields": fields_json,
        "resume": json.dumps(candidate, indent=2),
    })

    raw = result.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    try:
        actions = json.loads(raw)
        print(f"📋 LLM planned {len(actions)} actions")
    except json.JSONDecodeError:
        print(f"⚠️  Unparseable LLM response — using fallback\n   {raw[:300]}")
        actions = _fallback(candidate)

    return actions


def _fallback(candidate: dict) -> list[dict]:
    return [
        {"action": "fill", "for_id": "first_name", "label": "First Name", "value": candidate["first_name"]},
        {"action": "fill", "for_id": "last_name", "label": "Last Name", "value": candidate["last_name"]},
        {"action": "fill", "for_id": "email", "label": "Email", "value": candidate["email"]},
        {"action": "fill", "for_id": "phone", "label": "Phone", "value": candidate["phone"]},
    ]


# ---------------------------------------------------------------------------
# Runtime field-type detection + execution
# ---------------------------------------------------------------------------
def _css_escape(for_id: str) -> str:
    """Escape characters that are invalid in CSS selectors."""
    return re.sub(r"([\[\](){}!\"#$%&'*+,./:;<=>?@\\^`{|}~])", r"\\\1", for_id)


OPTION_SELECTORS = [
    "[id*='-option-']",           # React Select
    "[role='option']",             # ARIA standard
    ".pac-item",                   # Google Places Autocomplete
    "[class*='suggestion']",       # Generic autocomplete
    "[class*='autocomplete'] li",  # Greenhouse autocomplete list
]


async def _smart_fill(page: Page, for_id: str, label_text: str, value: str) -> None:
    """Fill a field, auto-detecting native input / select / combobox at runtime."""
    escaped = _css_escape(for_id)
    loc = page.locator(f"#{escaped}").first
    await loc.wait_for(state="attached", timeout=5_000)

    tag = await loc.evaluate("el => el.tagName.toLowerCase()")
    role = await loc.get_attribute("role") or ""
    aria_ac = await loc.get_attribute("aria-autocomplete") or ""

    if tag in ("input", "textarea"):
        input_type = await loc.get_attribute("type") or "text"

        if role == "combobox" or aria_ac:
            print(f" [combobox]", end="")
            await _interact_combobox(page, loc, value)
            return

        if input_type in ("text", "email", "tel", "url", "search", "number", "password", ""):
            print(f" [input]", end="")
            await loc.scroll_into_view_if_needed(timeout=3_000)
            await loc.fill(value)
            return

    if tag == "select":
        print(f" [select]", end="")
        await loc.scroll_into_view_if_needed(timeout=3_000)
        await loc.select_option(label=value)
        return

    # <div> or other wrapper — find the combobox input inside
    print(f" [div→rs]", end="")
    rs_input = loc.locator("input:not([type='hidden'])").first
    try:
        await rs_input.wait_for(state="attached", timeout=2_000)
        await _interact_combobox(page, rs_input, value)
    except Exception:
        await loc.scroll_into_view_if_needed(timeout=3_000)
        await loc.click()
        await page.wait_for_timeout(400)
        await page.keyboard.type(value, delay=30)
        await page.wait_for_timeout(600)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)


async def _interact_combobox(page: Page, rs_input, value: str) -> None:
    """Type into a combobox and select the matching option.
    Handles React Select, location autocomplete, and any ARIA combobox."""
    await rs_input.scroll_into_view_if_needed(timeout=3_000)
    await rs_input.click()
    await page.wait_for_timeout(400)

    await rs_input.press_sequentially(value, delay=40)
    # Wait for API-powered suggestions (location autocomplete needs ~2s)
    await page.wait_for_timeout(2_000)

    for sel in OPTION_SELECTORS:
        option = page.locator(sel).first
        try:
            await option.wait_for(state="visible", timeout=2_000)
            await option.click()
            await page.wait_for_timeout(300)
            return
        except Exception:
            continue

    # Fallback: arrow-down to highlight first suggestion, then Enter
    await page.keyboard.press("ArrowDown")
    await page.wait_for_timeout(300)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(300)


async def _smart_check(page: Page, for_id: str, label_text: str) -> None:
    """Check a checkbox, using label click as fallback."""
    if for_id:
        escaped = _css_escape(for_id)
        loc = page.locator(f"#{escaped}").first
        try:
            await loc.wait_for(state="attached", timeout=3_000)
            await loc.scroll_into_view_if_needed(timeout=3_000)
            if not await loc.is_checked():
                await loc.check()
            return
        except Exception:
            pass

    label = page.locator(f"label:has-text('{label_text}')").first
    await label.scroll_into_view_if_needed(timeout=3_000)
    await label.click()


async def execute_action(page: Page, action: dict) -> bool:
    """Execute one action with runtime type detection."""
    act = action.get("action", "fill")
    for_id = action.get("for_id", "")
    label = action.get("label", "")
    value = action.get("value", "")

    try:
        if act == "check":
            await _smart_check(page, for_id, label)
            print(f"  ✅ check | {label}")
        else:
            await _smart_fill(page, for_id, label, value)
            print(f"  ✅ fill  | {label} → {value}")
        return True

    except Exception as e:
        short = str(e).split("\n")[0][:120]
        print(f"  ⚠️  {act:5s} | {label or for_id} — {short}")
        return False


# ---------------------------------------------------------------------------
# Resume upload
# ---------------------------------------------------------------------------
async def upload_resume(page: Page, resume_path: str) -> bool:
    """Upload a resume by clicking Greenhouse's Attach button and intercepting
    the file chooser dialog — the only way that properly registers the upload."""
    path = Path(resume_path)
    if not path.exists():
        print(f"⚠️  Resume file not found: {resume_path}")
        return False

    # Find the Resume/CV section's Attach button (first one on the page)
    attach_btn = page.locator("text=Attach").first
    try:
        await attach_btn.scroll_into_view_if_needed(timeout=5_000)
    except Exception:
        print("⚠️  Could not find Attach button")
        return False

    async with page.expect_file_chooser(timeout=5_000) as fc_info:
        await attach_btn.click()
    file_chooser = await fc_info.value
    await file_chooser.set_files(str(path))

    await page.wait_for_timeout(2_000)
    print(f"  ✅ upload | Resume/CV → {path.name}")
    return True


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
async def apply_to_job(job_url: str, resume_path: str | None = None):
    browser = None
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=False, slow_mo=80)
            page = await browser.new_page()

            print(f"🌐 Navigating to {job_url}")
            await page.goto(job_url, wait_until="networkidle")

            form_locator = page.locator("form").first
            try:
                await form_locator.wait_for(timeout=10_000)
                form_html = await form_locator.inner_html()
            except Exception:
                print("⚠️  No <form> found — using full page")
                form_html = await page.content()

            ok = fail = 0

            # Pass 1: fill all visible fields
            actions = await plan_actions(form_html, CANDIDATE)
            print(f"\n🤖 Pass 1: filling {len(actions)} fields...")
            for i, action in enumerate(actions, 1):
                print(f"  [{i}/{len(actions)}]", end="")
                success = await execute_action(page, action)
                ok += success
                fail += not success

            # Resume upload
            if resume_path:
                print("\n📎 Uploading resume...")
                uploaded = await upload_resume(page, resume_path)
                if uploaded:
                    ok += 1
                else:
                    fail += 1

            # Pass 2: catch conditional fields that appeared after pass 1
            await page.wait_for_timeout(1_500)
            form_html_2 = await form_locator.inner_html()
            fields_before = set(json.dumps(a) for a in actions)
            actions_2 = await plan_actions(form_html_2, CANDIDATE)
            new_actions = [a for a in actions_2 if json.dumps(a) not in fields_before]

            if new_actions:
                print(f"\n🔄 Pass 2: {len(new_actions)} new fields appeared...")
                for i, action in enumerate(new_actions, 1):
                    print(f"  [{i}/{len(new_actions)}]", end="")
                    success = await execute_action(page, action)
                    ok += success
                    fail += not success

            # Pass 3: find any remaining unfilled required combobox dropdowns
            # (catches privacy policy and similar fields the LLM missed)
            unfilled = page.locator(
                "[class*='select__placeholder']:has-text('Select...')"
            )
            unfilled_count = await unfilled.count()
            if unfilled_count > 0:
                print(f"\n🔍 Found {unfilled_count} unfilled dropdown(s), attempting to fill...")
                for idx in range(unfilled_count):
                    try:
                        placeholder = unfilled.nth(idx)
                        if not await placeholder.is_visible():
                            continue
                        container = placeholder.locator("xpath=ancestor::div[contains(@class,'select__control')]/..")
                        await container.scroll_into_view_if_needed(timeout=2_000)

                        label_el = container.locator("xpath=preceding::label[1]")
                        label_text = await label_el.text_content() or "unknown"
                        label_text = label_text.strip()

                        rs_input = container.locator("input").first
                        await rs_input.click()
                        await page.wait_for_timeout(400)
                        await rs_input.press_sequentially("Yes", delay=40)
                        await page.wait_for_timeout(1_000)

                        option = page.locator("[id*='-option-']").first
                        try:
                            await option.wait_for(state="visible", timeout=2_000)
                            await option.click()
                            await page.wait_for_timeout(300)
                            print(f"  ✅ fill  | {label_text} → Yes")
                            ok += 1
                        except Exception:
                            await page.keyboard.press("Escape")
                            print(f"  ⚠️  Could not fill: {label_text}")
                            fail += 1
                    except Exception as e:
                        continue

            print(f"\n📊 Results: {ok} succeeded, {fail} failed")

            # Submit the application
            submit = page.locator("input[type='submit'], button[type='submit']").first
            await submit.scroll_into_view_if_needed(timeout=3_000)
            print("🚀 Submitting application...")
            await submit.click()
            await page.wait_for_timeout(5_000)
            print("✅ Application submitted!")

            await page.wait_for_timeout(3_000)
            await browser.close()

    except KeyboardInterrupt:
        print("\n⏹  Interrupted — closing browser")
        if browser:
            await browser.close()


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else TEST_URL
    resume = None
    if "--resume" in sys.argv:
        idx = sys.argv.index("--resume")
        if idx + 1 < len(sys.argv):
            resume = sys.argv[idx + 1]
    asyncio.run(apply_to_job(url, resume))
