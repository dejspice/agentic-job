import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectATS, isSupported } from "../ats-router.js";
import { AtsType } from "../enums/ats-type.js";

describe("detectATS", () => {
  it("detects Greenhouse URLs", () => {
    assert.equal(
      detectATS("https://boards.greenhouse.io/acme/jobs/12345"),
      AtsType.GREENHOUSE,
    );
    assert.equal(
      detectATS("https://job-boards.greenhouse.io/company/jobs/99"),
      AtsType.GREENHOUSE,
    );
  });

  it("detects Lever URLs", () => {
    assert.equal(
      detectATS("https://jobs.lever.co/acme/abc-123"),
      AtsType.LEVER,
    );
    assert.equal(
      detectATS("https://lever.co/acme/jobs/456"),
      AtsType.LEVER,
    );
  });

  it("detects Workday URLs", () => {
    assert.equal(
      detectATS("https://acme.myworkdayjobs.com/en-US/external/job/NYC/SWE"),
      AtsType.WORKDAY,
    );
    assert.equal(
      detectATS("https://company.workday.com/path"),
      AtsType.WORKDAY,
    );
  });

  it("detects iCIMS URLs", () => {
    assert.equal(
      detectATS("https://careers-acme.icims.com/jobs/12345/job"),
      AtsType.ICIMS,
    );
  });

  it("detects Ashby URLs", () => {
    assert.equal(
      detectATS("https://jobs.ashbyhq.com/company/abc-123"),
      AtsType.ASHBY,
    );
  });

  it("detects SmartRecruiters URLs", () => {
    assert.equal(
      detectATS("https://jobs.smartrecruiters.com/Acme/1234"),
      AtsType.SMARTRECRUITERS,
    );
  });

  it("detects Taleo URLs", () => {
    assert.equal(
      detectATS("https://acme.taleo.net/careersection/2/jobdetail.ftl"),
      AtsType.TALEO,
    );
  });

  it("detects SAP SuccessFactors URLs", () => {
    assert.equal(
      detectATS("https://performancemanager.successfactors.com/sfcareer/jobreq"),
      AtsType.SAP,
    );
  });

  it("returns CUSTOM for unknown URLs", () => {
    assert.equal(detectATS("https://example.com/careers"), AtsType.CUSTOM);
    assert.equal(detectATS("https://company.bamboohr.com/jobs"), AtsType.CUSTOM);
    assert.equal(detectATS(""), AtsType.CUSTOM);
  });
});

describe("isSupported", () => {
  it("returns true for Greenhouse", () => {
    assert.equal(isSupported(AtsType.GREENHOUSE), true);
  });

  it("returns false for Lever (not yet)", () => {
    assert.equal(isSupported(AtsType.LEVER), false);
  });

  it("returns false for all other ATS types", () => {
    assert.equal(isSupported(AtsType.WORKDAY), false);
    assert.equal(isSupported(AtsType.ICIMS), false);
    assert.equal(isSupported(AtsType.ASHBY), false);
    assert.equal(isSupported(AtsType.TALEO), false);
    assert.equal(isSupported(AtsType.SAP), false);
    assert.equal(isSupported(AtsType.CUSTOM), false);
  });
});
