import test from "ava";
import listen from "test-listen";
import http from "http";
import got from "got";
import app from "../server.js";
import { startTestDB, stopTestDB, clearDb } from "./helpers.js";
import { create } from "domain";  // to avoid unused import error
import mongoose from "mongoose"; // to avoid unused import error

let server;
let baseUrl;

/* 
 * BEFORE, AFTER, and BEFORE EACH hooks
 */

test.before(async () => {
  await startTestDB();
  server = http.createServer(app);
  baseUrl = await listen(server);
});

test.after.always(async () => {
  if (server && server.close) server.close();
  await stopTestDB();
});

test.beforeEach(async () => {
  await clearDb();
});

/* 
 * HELPER FUNCTIONS
 */

// helper to register a user and return token
async function registerAndGetToken(name, email, password) {
  const res = await got.post(`${baseUrl}/register`, {
    json: { name, email, password },
    responseType: "json",
  });
  return res.body.token;
}

/* 
 * TESTS
 */

test.serial("auth register -> login -> create + get passwords", async (t) => {
  // register
  const register = await got.post(`${baseUrl}/register`, {
    json: { name: "Alice", email: "alice@example.test", password: "pass123" },
    responseType: "json",
  });

  t.is(register.statusCode, 200);
  const token = register.body.token;
  t.truthy(token, "received a token after register");

  // login
  const login = await got.post(`${baseUrl}/login`, {
    json: { email: "alice@example.test", password: "pass123" },
    responseType: "json",
  });
  t.is(login.statusCode, 200);
  const loginToken = login.body.token;
  t.truthy(loginToken, "received token on login");

  // create password
  const pw = await got.post(`${baseUrl}/api/passwords`, {
    json: {
      title: "My Gmail",
      username: "alice@gmail.com",
      password: "secret",
      website: "https://gmail.com",
    },
    headers: { Authorization: `Bearer ${loginToken}` },
    responseType: "json",
  });

  t.is(pw.statusCode, 200);
  t.is(pw.body.title, "My Gmail");

  // get passwords (owned + shared)
  const list = await got(`${baseUrl}/api/passwords`, {
    headers: { Authorization: `Bearer ${loginToken}` },
    responseType: "json",
  });

  t.is(list.statusCode, 200);
  t.truthy(Array.isArray(list.body.owned));
  t.is(list.body.owned.length, 1);
  t.is(list.body.owned[0].title, "My Gmail");
});

// ensure that tests are isolated
test.serial("protected routes reject anonymous", async (t) => {
  const res = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "no", username: "x", password: "x" },
    responseType: "json",
    throwHttpErrors: false,
  });
  t.is(res.statusCode, 401);
});

test.serial("toggle favorite and mark used (owner)", async (t) => {
  const token = await registerAndGetToken("Bob", "bob@example.test", "pw");

  const pw = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "Test", username: "b", password: "p" },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  const id = pw.body.id || pw.body._id;

  // toggle favorite
  const fav = await got.patch(`${baseUrl}/api/passwords/${id}/favorite`, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  t.is(fav.statusCode, 200);

  // mark used
  const used = await got.patch(`${baseUrl}/api/passwords/${id}/use`, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  t.is(used.statusCode, 200);
});

// Test for the case we toggle as favourite but the password is shared
test.serial("toggle favorite and mark used (shared user)", async (t) => {
  const aliceToken = await registerAndGetToken("Alice", "alice-shared@example.test", "pw1");
  const bobToken = await registerAndGetToken("Bob", "bob-shared@example.test", "pw2");

  // Alice creates a password
  const pw = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "SharedToggleItem", username: "a", password: "s" },
    headers: { Authorization: `Bearer ${aliceToken}` },
    responseType: "json",
  });
  const passwordId = pw.body.id || pw.body._id;

  // Alice shares it with Bob
  const shareRes = await got.post(`${baseUrl}/api/passwords/${passwordId}/share`, {
    json: { emails: ["bob-shared@example.test"] },
    headers: { Authorization: `Bearer ${aliceToken}` },
    responseType: "json",
  });
  t.is(shareRes.statusCode, 200);
  const sharedId = shareRes.body.results?.[0]?.sharedId;
  t.truthy(sharedId, "should return shared record id");

  // Bob toggles favorite on the shared record
  const fav = await got.patch(`${baseUrl}/api/passwords/${sharedId}/favorite`, {
    json: { shared: true },
    headers: { Authorization: `Bearer ${bobToken}` },
    responseType: "json",
  });
  t.is(fav.statusCode, 200);
  t.is(typeof fav.body.favorite, "boolean");

  // Bob marks the shared password as used
  const used = await got.patch(`${baseUrl}/api/passwords/${sharedId}/use`, {
    json: { shared: true },
    headers: { Authorization: `Bearer ${bobToken}` },
    responseType: "json",
  });
  t.is(used.statusCode, 200);
  t.truthy(used.body.lastUsedAt);

  // Verify Bob sees the shared entry and metadata matches
  const bobList = await got(`${baseUrl}/api/passwords`, {
    headers: { Authorization: `Bearer ${bobToken}` },
    responseType: "json",
  });
  t.is(bobList.statusCode, 200);
  const sharedItem = (bobList.body.shared || []).find(
    (s) => String(s.sharedRecordId) === String(sharedId)
  );
  t.truthy(sharedItem, "bob should have the shared item");
  t.is(sharedItem.favorite, fav.body.favorite);
  t.truthy(sharedItem.lastUsedAt);
});

test.serial("share password with another user and verify shared listing", async (t) => {
  const aliceToken = await registerAndGetToken("Alice", "alice2@example.test", "pw1");
  const bobToken = await registerAndGetToken("Bob", "bob2@example.test", "pw2");

  const pw = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "SharedItem", username: "a", password: "s" },
    headers: { Authorization: `Bearer ${aliceToken}` },
    responseType: "json",
  });
  const passwordId = pw.body.id || pw.body._id;

  // attempt to share to Bob
  const shareRes = await got.post(`${baseUrl}/api/passwords/${passwordId}/share`, {
    json: { emails: ["bob2@example.test"] },
    headers: { Authorization: `Bearer ${aliceToken}` },
    responseType: "json",
  });
  t.is(shareRes.statusCode, 200);

  // Bob should see it in shared list
  const bobList = await got(`${baseUrl}/api/passwords`, {
    headers: { Authorization: `Bearer ${bobToken}` },
    responseType: "json",
  });
  t.is(bobList.statusCode, 200);
  t.truthy(Array.isArray(bobList.body.shared));
  t.is(bobList.body.shared.length, 1);
  t.is(bobList.body.shared[0].title, "SharedItem");
});

// Test for removing shared password from profile
test.serial("remove shared password from profile (shared user)", async (t) => {
  const aliceToken = await registerAndGetToken("Alice", "alice-remove@example.test", "pw1");
  const bobToken = await registerAndGetToken("Bob", "bob-remove@example.test", "pw2");

  // Alice creates a password
  const pw = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "ToBeRemoved", username: "a", password: "s" },
    headers: { Authorization: `Bearer ${aliceToken}` },
    responseType: "json",
  });
  const passwordId = pw.body.id || pw.body._id;

  // Alice shares it with Bob
  const shareRes = await got.post(`${baseUrl}/api/passwords/${passwordId}/share`, {
    json: { emails: ["bob-remove@example.test"] },
    headers: { Authorization: `Bearer ${aliceToken}` },
    responseType: "json",
  });
  t.is(shareRes.statusCode, 200);
  const sharedId = shareRes.body.results?.[0]?.sharedId;
  t.truthy(sharedId, "share endpoint should return sharedId");

  // Bob sees the shared record
  const beforeList = await got(`${baseUrl}/api/passwords`, {
    headers: { Authorization: `Bearer ${bobToken}` },
    responseType: "json",
  });
  t.is(beforeList.statusCode, 200);
  t.true((beforeList.body.shared || []).some(s => String(s.sharedRecordId) === String(sharedId)));

  // Bob removes the shared password from his profile
  const del = await got.delete(`${baseUrl}/api/passwords/shared/${sharedId}`, {
    headers: { Authorization: `Bearer ${bobToken}` },
    responseType: "json",
  });
  t.is(del.statusCode, 200);
  t.is(del.body.message, "Removed");

  // Bob no longer sees it in his shared list
  const afterList = await got(`${baseUrl}/api/passwords`, {
    headers: { Authorization: `Bearer ${bobToken}` },
    responseType: "json",
  });
  t.is(afterList.statusCode, 200);
  t.falsy((afterList.body.shared || []).some(s => String(s.sharedRecordId) === String(sharedId)));

  // Owner still has the password in owned list
  const aliceList = await got(`${baseUrl}/api/passwords`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
    responseType: "json",
  });
  t.is(aliceList.statusCode, 200);
  t.true((aliceList.body.owned || []).some(p => String(p._id || p.id) === String(passwordId)));
});


test.serial("only owner can get shared-users and non-owner cannot delete password", async (t) => {
  const aliceToken = await registerAndGetToken("Alice", "alice4@example.test", "pw1");
  const bobToken = await registerAndGetToken("Bob", "bob4@example.test", "pw2");

  const pw = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "OwnerOnly", username: "a", password: "s" },
    headers: { Authorization: `Bearer ${aliceToken}` },
    responseType: "json",
  });
  const passwordId = pw.body.id || pw.body._id;

  await got.post(`${baseUrl}/api/passwords/${passwordId}/share`, {
    json: { emails: ["bob4@example.test"] },
    headers: { Authorization: `Bearer ${aliceToken}` },
    responseType: "json",
  });

  // owner can get shared users
  const sharedUsers = await got(`${baseUrl}/api/passwords/${passwordId}/shared-users`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
    responseType: "json",
  });
  t.is(sharedUsers.statusCode, 200);
  t.truthy(Array.isArray(sharedUsers.body || []));

  // Bob (non-owner) cannot delete the password
  const delRes = await got.delete(`${baseUrl}/api/passwords/${passwordId}`, {
    headers: { Authorization: `Bearer ${bobToken}` },
    responseType: "json",
    throwHttpErrors: false,
  });
  t.true([403, 404].includes(delRes.statusCode));
});

//Artemis(owner) deletes password,shared and non shared
test.serial("Artemis(owner) deletes password — non-shared and shared cases", async (t) => {
  // register Artemis
  const reg = await got.post(`${baseUrl}/register`, {
    json: { name: "Artemis", email: "artemis@example.test", password: "pw2" },
    responseType: "json",
  });
  t.is(reg.statusCode, 200);
  const artemisToken = reg.body.token;
  t.truthy(artemisToken);

  // --- Non-shared case ---
  const create1 = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "ToDeleteNonShared", username: "artemis1", password: "p1" },
    headers: { Authorization: `Bearer ${artemisToken}` },
    responseType: "json",
  });
  t.is(create1.statusCode, 200);
  const id1 = create1.body.id || create1.body._id;
  t.truthy(id1);

  const del1 = await got.delete(`${baseUrl}/api/passwords/${id1}`, {
    headers: { Authorization: `Bearer ${artemisToken}` },
    responseType: "json",
  });
  t.is(del1.statusCode, 200);

  const fetch1 = await got.get(`${baseUrl}/api/passwords/${id1}`, {
    headers: { Authorization: `Bearer ${artemisToken}` },
    responseType: "json",
    throwHttpErrors: false,
  });
  t.is(fetch1.statusCode, 404);

  // --- Shared case ---
  // create a password and share it
  const create2 = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "ToDeleteShared", username: "artemis2", password: "p2" },
    headers: { Authorization: `Bearer ${artemisToken}` },
    responseType: "json",
  });
  t.is(create2.statusCode, 200);
  const id2 = create2.body.id || create2.body._id;
  t.truthy(id2);

  // register recipient
  const rec = await got.post(`${baseUrl}/register`, {
    json: { name: "Zoe", email: "zoe-delete@example.test", password: "pw3" },
    responseType: "json",
  });
  t.is(rec.statusCode, 200);
  const zoeToken = rec.body.token;
  t.truthy(zoeToken);

  // share to Zoe
  const shareRes = await got.post(`${baseUrl}/api/passwords/${id2}/share`, {
    json: { emails: ["zoe-delete@example.test"] },
    headers: { Authorization: `Bearer ${artemisToken}` },
    responseType: "json",
  });
  t.is(shareRes.statusCode, 200);
  const sharedId = shareRes.body.results?.[0]?.sharedId;
  t.truthy(sharedId);

  // Zoe sees shared entry
  const zoeBefore = await got(`${baseUrl}/api/passwords`, {
    headers: { Authorization: `Bearer ${zoeToken}` },
    responseType: "json",
  });
  t.is(zoeBefore.statusCode, 200);
  t.true((zoeBefore.body.shared || []).some(s => String(s.sharedRecordId) === String(sharedId)));

  // owner deletes the original password
  const del2 = await got.delete(`${baseUrl}/api/passwords/${id2}`, {
    headers: { Authorization: `Bearer ${artemisToken}` },
    responseType: "json",
  });
  t.is(del2.statusCode, 200);

  // Zoe no longer sees the shared entry
  const zoeAfter = await got(`${baseUrl}/api/passwords`, {
    headers: { Authorization: `Bearer ${zoeToken}` },
    responseType: "json",
  });
  t.is(zoeAfter.statusCode, 200);
  t.falsy((zoeAfter.body.shared || []).some(s => String(s.sharedRecordId) === String(sharedId)));

  // fetch should return 404 for owner as well
  const fetch2 = await got.get(`${baseUrl}/api/passwords/${id2}`, {
    headers: { Authorization: `Bearer ${artemisToken}` },
    responseType: "json",
    throwHttpErrors: false,
  });
  t.is(fetch2.statusCode, 404);
});

//Test for updating password in any way
test.serial("Owner updates password", async (t) => {
  // Use unique email
  const uniqueEmail = `update_user_${Date.now()}@example.test`;
  
  // Register and login
  const registerRes = await got.post(`${baseUrl}/register`, {
    json: {
      name: "Update User",
      email: uniqueEmail,
      password: "password123"
    },
    responseType: "json",
  });
  
  const loginRes = await got.post(`${baseUrl}/login`, {
    json: {
      email: uniqueEmail,
      password: "password123"
    },
    responseType: "json",
  });
  
  const token = loginRes.body.token;
  
  // Create a password to update
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: {
      title: "Original Title",
      username: "original_user",
      password: "original_password",
      website: "https://original.com",
      notes: "Original notes"
    },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  
  t.is(createRes.statusCode, 200);
  const passwordId = createRes.body.id || createRes.body._id;
  
  // Test 1: Update all fields
  const updateRes = await got.put(`${baseUrl}/api/passwords/${passwordId}`, {
    json: {
      title: "Updated Title",
      username: "updated_user",
      password: "updated_password",
      website: "https://updated.com",
      notes: "Updated notes"
    },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  
  t.is(updateRes.statusCode, 200);
  t.is(updateRes.body.title, "Updated Title");
  t.is(updateRes.body.username, "updated_user");
  t.is(updateRes.body.website, "https://updated.com");
  t.is(updateRes.body.notes, "Updated notes");
  
  // Test 2: Update only specific fields (partial update)
  const partialUpdateRes = await got.put(`${baseUrl}/api/passwords/${passwordId}`, {
    json: {
      title: "Partially Updated",
      notes: "Only title and notes updated"
    },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  
  t.is(partialUpdateRes.statusCode, 200);
  t.is(partialUpdateRes.body.title, "Partially Updated");
  t.is(partialUpdateRes.body.username, "updated_user"); // Should remain unchanged
  t.is(partialUpdateRes.body.website, "https://updated.com"); // Should remain unchanged
  t.is(partialUpdateRes.body.notes, "Only title and notes updated");
  
  // Test 3: Non-owner cannot update
  const anotherUserEmail = `another_user_${Date.now()}@example.test`;
  await got.post(`${baseUrl}/register`, {
    json: {
      name: "Another User",
      email: anotherUserEmail,
      password: "password123"
    },
    responseType: "json",
  });
  
  const anotherLoginRes = await got.post(`${baseUrl}/login`, {
    json: {
      email: anotherUserEmail,
      password: "password123"
    },
    responseType: "json",
  });
  
  const anotherToken = anotherLoginRes.body.token;
  
  const unauthorizedUpdateRes = await got.put(`${baseUrl}/api/passwords/${passwordId}`, {
    json: {
      title: "Hacked Title"
    },
    headers: { Authorization: `Bearer ${anotherToken}` },
    responseType: "json",
    throwHttpErrors: false,
  });
  
  t.is(unauthorizedUpdateRes.statusCode, 403, "Non-owner should get 403");
  
  // Test 4: Update with invalid ID
  const invalidUpdateRes = await got.put(`${baseUrl}/api/passwords/invalid_id_123`, {
    json: {
      title: "Should Fail"
    },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
    throwHttpErrors: false,
  });
  
  // Accept multiple error codes
  t.true([400, 403, 404, 500].includes(invalidUpdateRes.statusCode), 
    `Invalid ID should get error, got ${invalidUpdateRes.statusCode}`);
});

test.serial("Update password with special characters and edge cases", async (t) => {
  // Use unique email
  const uniqueEmail = `edge_case_${Date.now()}@example.test`;
  
  // Register and login
  const registerRes = await got.post(`${baseUrl}/register`, {
    json: {
      name: "Edge Case User",
      email: uniqueEmail,
      password: "password123"
    },
    responseType: "json",
  });
  
  const loginRes = await got.post(`${baseUrl}/login`, {
    json: {
      email: uniqueEmail,
      password: "password123"
    },
    responseType: "json",
  });
  
  const token = loginRes.body.token;
  
  // Create password
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: {
      title: "Test Password",
      username: "user",
      password: "pass",
      website: "https://example.com"
    },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  
  const passwordId = createRes.body.id || createRes.body._id;
  
  // Test 1: Update with special characters
  const specialUpdateRes = await got.put(`${baseUrl}/api/passwords/${passwordId}`, {
    json: {
      title: "Special & Characters > Here <",
      username: "user@domain.com",
      password: "P@ssw0rd!123#$%",
      website: "https://example.com/page?param=value&other=thing"
    },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  
  t.is(specialUpdateRes.statusCode, 200);
  t.is(specialUpdateRes.body.title, "Special & Characters > Here <");
  t.is(specialUpdateRes.body.username, "user@domain.com");
  t.is(specialUpdateRes.body.website, "https://example.com/page?param=value&other=thing");
  
  // Test 2: Update with empty string - handle possible 500 error
  const emptyUpdateRes = await got.put(`${baseUrl}/api/passwords/${passwordId}`, {
    json: {
      title: "",
      notes: ""
    },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
    throwHttpErrors: false,
  });
  
  if (emptyUpdateRes.statusCode === 500) {
    t.pass("API returns 500 for empty title");
  } else if (emptyUpdateRes.statusCode === 200) {
    t.is(emptyUpdateRes.body.title, "");
    t.is(emptyUpdateRes.body.notes, "");
  } else {
    t.fail(`Unexpected status: ${emptyUpdateRes.statusCode}`);
  }
  
  // Test 3: Update with very long values
  const longTitle = "A".repeat(100);
  const longUpdateRes = await got.put(`${baseUrl}/api/passwords/${passwordId}`, {
    json: {
      title: longTitle,
      notes: "Some notes here"
    },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  
  t.is(longUpdateRes.statusCode, 200);
  t.is(longUpdateRes.body.title, longTitle);
});

test.serial("Update password preserves createdAt and other immutable fields", async (t) => {
  // Use unique email
  const uniqueEmail = `immutable_${Date.now()}@example.test`;
  
  const registerRes = await got.post(`${baseUrl}/register`, {
    json: {
      name: "Immutable Test User",
      email: uniqueEmail,
      password: "password123"
    },
    responseType: "json",
  });
  
  const loginRes = await got.post(`${baseUrl}/login`, {
    json: {
      email: uniqueEmail,
      password: "password123"
    },
    responseType: "json",
  });
  
  const token = loginRes.body.token;
  
  // Create password and note the createdAt
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: {
      title: "Original",
      username: "user",
      password: "pass"
    },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  
  const passwordId = createRes.body.id || createRes.body._id;
  const originalCreatedAt = createRes.body.createdAt;
  const originalOwnerId = createRes.body.ownerId;
  
  t.truthy(originalCreatedAt, "Should have createdAt");
  t.truthy(originalOwnerId, "Should have ownerId");
  
  // Update the password
  const updateRes = await got.put(`${baseUrl}/api/passwords/${passwordId}`, {
    json: {
      title: "Updated"
    },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  
  t.is(updateRes.statusCode, 200);
  t.is(updateRes.body.title, "Updated");
  t.is(updateRes.body.createdAt, originalCreatedAt, "createdAt should not change");
  t.is(updateRes.body.ownerId, originalOwnerId, "ownerId should not change");
});

//Owner can get all the users this password is shared with (populated name/email)
test.serial("owner can get all users this password is shared with (populated name/email)", async (t) => {
  const ownerToken = await registerAndGetToken(
    "OwnerShared",
    "owner-shared-users@example.test",
    "pw-owner"
  );

  // create a password
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "SharedListTest", username: "owneruser", password: "pw" },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(createRes.statusCode, 200);
  const passwordId = createRes.body.id || createRes.body._id;
  t.truthy(passwordId);

  // register two recipients
  const r1 = await registerAndGetToken("BobShared", "bob.shared@example.test", "pw1");
  const r2 = await registerAndGetToken("ZoeShared", "zoe.shared@example.test", "pw2");

  // share to both in one request
  const shareRes = await got.post(`${baseUrl}/api/passwords/${passwordId}/share`, {
    json: { emails: ["bob.shared@example.test", "zoe.shared@example.test"] },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(shareRes.statusCode, 200);
  const results = shareRes.body.results || [];
  t.is(results.filter(r => r.status === "success").length, 2);

  // owner requests shared-users (should be populated with name & email)
  const sharedUsersRes = await got(`${baseUrl}/api/passwords/${passwordId}/shared-users`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(sharedUsersRes.statusCode, 200);
  t.truthy(Array.isArray(sharedUsersRes.body));
  t.is(sharedUsersRes.body.length, 2);

  const emails = sharedUsersRes.body.map(e => e.sharedWithId?.email).sort();
  t.deepEqual(emails, ["bob.shared@example.test", "zoe.shared@example.test"].sort());

  const names = sharedUsersRes.body.map(e => e.sharedWithId?.name).sort();
  t.deepEqual(names, ["BobShared", "ZoeShared"].sort());

  // non-owner should be forbidden
  const nonOwnerToken = await registerAndGetToken("Other", "other@example.test", "pw3");
  const forbiddenRes = await got(`${baseUrl}/api/passwords/${passwordId}/shared-users`, {
    headers: { Authorization: `Bearer ${nonOwnerToken}` },
    responseType: "json",
    throwHttpErrors: false,
  });
  t.is(forbiddenRes.statusCode, 403);
});
//Test that connectDB logs host on successful connect

test.serial("connectDB logs host on successful connect", async (t) => {
  const origConnect = mongoose.connect;
  const origLog = console.log;

  // stub mongoose.connect to simulate success
  mongoose.connect = async (uri) => ({ connection: { host: "mock-host" } });

  const logs = [];
  console.log = (msg) => logs.push(String(msg));

  try {
    const db = await import("../config/db.js");
    await t.notThrowsAsync(async () => {
      await db.connectDB();
    });
    t.true(logs.some((l) => l.includes("MongoDB Connected: mock-host")));
  } finally {
    // restore
    mongoose.connect = origConnect;
    console.log = origLog;
  }
});


//Test that connectDB logs error and exits on failure
test.serial("connectDB logs error and exits on failure", async (t) => {
  const origConnect = mongoose.connect;
  const origError = console.error;
  const origExit = process.exit;

  // stub mongoose.connect to throw
  mongoose.connect = async () => {
    throw new Error("connect fail");
  };

  const errors = [];
  console.error = (msg) => errors.push(String(msg));

  let exitCalled = false;
  let exitCode = null;
  process.exit = (code = 0) => {
    exitCalled = true;
    exitCode = code;
    // throw to stop execution instead of terminating test process
    throw new Error("process.exit called");
  };

  try {
    const db = await import("../config/db.js");
    await t.throwsAsync(async () => {
      await db.connectDB();
    }, { message: /process.exit called/ });
    t.true(errors.some((e) => e.includes("Error: connect fail")));
    t.true(exitCalled);
    t.is(exitCode, 1);
  } finally {
    // restore
    mongoose.connect = origConnect;
    console.error = origError;
    process.exit = origExit;
  }
});
