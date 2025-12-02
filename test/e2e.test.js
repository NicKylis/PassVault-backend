import test from "ava";
import listen from "test-listen";
import http from "http";
import got from "got";
import app from "../server.js";
import { startTestDB, stopTestDB, clearDb } from "./helpers.js";

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