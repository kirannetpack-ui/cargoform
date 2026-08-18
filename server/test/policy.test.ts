import test from "node:test";
import assert from "node:assert/strict";
import { can, canTransitionDocument, canTransitionShipment, requiresAmendment } from "../src/policy.js";

test("role permissions enforce separation of duties", () => {
  assert.equal(can("OWNER", "STAFF_MANAGE"), true);
  assert.equal(can("OPERATIONS", "STAFF_MANAGE"), false);
  assert.equal(can("FINANCE", "CLIENT_BILLING_MANAGE"), true);
  assert.equal(can("READ_ONLY", "SHIPMENT_EDIT"), false);
});

test("shipment lifecycle blocks invalid shortcuts", () => {
  assert.equal(canTransitionShipment("DRAFT", "CONFIRMED"), false);
  assert.equal(canTransitionShipment("APPROVED_FOR_BOOKING", "CONFIRMED"), true);
  assert.equal(canTransitionShipment("CONFIRMED", "DEPARTED"), true);
  assert.equal(canTransitionShipment("DEPARTED", "DRAFT"), false);
  assert.equal(requiresAmendment("DEPARTED"), true);
  assert.equal(requiresAmendment("CONFIRMED"), false);
});

test("issued documents cannot return to draft", () => {
  assert.equal(canTransitionDocument("DRAFT", "UNDER_REVIEW"), true);
  assert.equal(canTransitionDocument("ISSUED", "DRAFT"), false);
  assert.equal(canTransitionDocument("ISSUED", "SUPERSEDED"), true);
});
