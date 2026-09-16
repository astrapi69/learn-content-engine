import { describe, it, expect } from "vitest";

import { attributeName, canonicalName, elementName } from "./dialect.js";

/**
 * QTI 3.0 renamed every QTI 2.x element to a ``qti-`` prefixed kebab-case
 * form and every multi-word attribute to kebab-case; the semantics of the
 * mappable subset did not change. These three pure functions carry the whole
 * dialect difference, so the import and export code can keep speaking 2.x
 * names internally.
 */

describe("canonicalName (any dialect -> the 2.x name the mapping code uses)", () => {
  it("strips the qti- prefix and camel-cases a 3.0 element name", () => {
    expect(canonicalName("qti-choice-interaction")).toBe("choiceInteraction");
    expect(canonicalName("qti-assessment-item")).toBe("assessmentItem");
    expect(canonicalName("qti-simple-associable-choice")).toBe("simpleAssociableChoice");
    expect(canonicalName("qti-value")).toBe("value");
  });

  it("camel-cases a 3.0 attribute name (no prefix on attributes)", () => {
    expect(canonicalName("response-identifier")).toBe("responseIdentifier");
    expect(canonicalName("map-key")).toBe("mapKey");
    expect(canonicalName("base-type")).toBe("baseType");
  });

  it("leaves 2.x names and plain HTML names untouched", () => {
    expect(canonicalName("choiceInteraction")).toBe("choiceInteraction");
    expect(canonicalName("responseIdentifier")).toBe("responseIdentifier");
    expect(canonicalName("p")).toBe("p");
    expect(canonicalName("identifier")).toBe("identifier");
  });
});

describe("elementName / attributeName (2.x name -> the requested dialect)", () => {
  it("2.x is the identity", () => {
    expect(elementName("choiceInteraction", "2.x")).toBe("choiceInteraction");
    expect(attributeName("responseIdentifier", "2.x")).toBe("responseIdentifier");
  });

  it("3.0 prefixes and kebab-cases elements, kebab-cases attributes", () => {
    expect(elementName("choiceInteraction", "3.0")).toBe("qti-choice-interaction");
    expect(elementName("assessmentTest", "3.0")).toBe("qti-assessment-test");
    expect(elementName("value", "3.0")).toBe("qti-value");
    expect(attributeName("responseIdentifier", "3.0")).toBe("response-identifier");
    expect(attributeName("maxChoices", "3.0")).toBe("max-choices");
    expect(attributeName("identifier", "3.0")).toBe("identifier");
  });

  it("round-trips every 2.x name the adapter uses through 3.0 and back", () => {
    for (const name of ["assessmentItem", "responseDeclaration", "correctResponse", "itemBody", "textEntryInteraction", "simpleMatchSet", "mapEntry"]) {
      expect(canonicalName(elementName(name, "3.0"))).toBe(name);
    }
    for (const name of ["responseIdentifier", "timeDependent", "expectedLength", "mappedValue", "maxAssociations", "navigationMode"]) {
      expect(canonicalName(attributeName(name, "3.0"))).toBe(name);
    }
  });
});
