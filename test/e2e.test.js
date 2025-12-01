import test from "ava";
import listen from "test-listen";
import http from "http";
import got from "got";
import app from "../server.js";
import { startTestDB, stopTestDB, clearDb } from "./helpers.js";

let server;
let baseUrl;

test.before(async () => {
  // start test database
  await startTestDB();
  // start HTTP listener using a fresh server instance (don't call app.listen twice)
  server = http.createServer(app);
  baseUrl = await listen(server);
});

test.after.always(async () => {
  // cleanup server and DB
  if (server && server.close) server.close();
  await stopTestDB();
});

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
  // since auth middleware returns 401 by default
  t.is(res.statusCode, 401);
});

test.serial("toggle favorite and mark used (owner)", async (t) => {
  // register and login another user
  const r = await got.post(`${baseUrl}/register`, {
    json: { name: "Bob", email: "bob@example.test", password: "pw" },
    responseType: "json",
  });
  const token = r.body.token;

  // create password
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
