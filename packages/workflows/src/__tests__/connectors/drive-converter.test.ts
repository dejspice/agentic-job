import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractDriveFileId } from "../../connectors/drive-converter.js";

describe("extractDriveFileId", () => {
  it("extracts ID from a Google Doc URL", () => {
    assert.equal(
      extractDriveFileId(
        "https://docs.google.com/document/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit",
      ),
      "1aBcDeFgHiJkLmNoPqRsTuVwXyZ",
    );
  });

  it("extracts ID from a Drive file URL", () => {
    assert.equal(
      extractDriveFileId(
        "https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/view?usp=sharing",
      ),
      "1aBcDeFgHiJkLmNoPqRsTuVwXyZ",
    );
  });

  it("extracts ID from a Drive open URL with query param", () => {
    assert.equal(
      extractDriveFileId(
        "https://drive.google.com/open?id=1aBcDeFgHiJkLmNoPqRsTuVwXyZ",
      ),
      "1aBcDeFgHiJkLmNoPqRsTuVwXyZ",
    );
  });

  it("handles IDs with hyphens and underscores", () => {
    assert.equal(
      extractDriveFileId(
        "https://docs.google.com/document/d/abc-DEF_123-xyz/edit",
      ),
      "abc-DEF_123-xyz",
    );
  });

  it("throws for URLs without a file ID", () => {
    assert.throws(
      () => extractDriveFileId("https://example.com/no-drive-link"),
      /Cannot extract Drive file ID/,
    );
  });
});
