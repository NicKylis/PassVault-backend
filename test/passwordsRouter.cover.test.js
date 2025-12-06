import test from "ava";
import listen from "test-listen";
import http from "http";
import got from "got";
import app from "../server.js";
import { startTestDB, stopTestDB, clearDb } from "./helpers.js";
import Password from "../models/Password.js";
import SharedPassword from "../models/SharedPassword.js";
import User from "../models/User.js";

let server;
let baseUrl;

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

// helper to register a user and return token
async function registerAndGetToken(name, email, password) {
  const res = await got.post(`${baseUrl}/register`, {
    json: { name, email, password },
    responseType: "json",
  });
  return res.body.token;
}

test.serial("DELETE /api/passwords/:id calls SharedPassword.deleteMany and returns Deleted", async (t) => {
  const token = await registerAndGetToken("OwnerDel", "owner-del@example.test", "pw");

  // create a password
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "ToDelete", username: "u", password: "p" },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  t.is(createRes.statusCode, 200);
  const passwordId = createRes.body.id || createRes.body._id;

  // stub SharedPassword.deleteMany to observe calls
  const origDeleteMany = SharedPassword.deleteMany;
  let called = false;
  let calledWith = null;
  SharedPassword.deleteMany = async function (q) {
    called = true;
    calledWith = q;
    return origDeleteMany.call(this, q);
  };

  try {
    const del = await got.delete(`${baseUrl}/api/passwords/${passwordId}`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "json",
    });

    t.is(del.statusCode, 200);
    t.is(del.body.message, "Deleted");
    t.true(called, "SharedPassword.deleteMany should be called by the delete route");
    t.truthy(
      calledWith && (String(calledWith.passwordId) === String(passwordId) || String(calledWith.passwordId) === String(createRes.body._id))
    );
  } finally {
    SharedPassword.deleteMany = origDeleteMany;
  }
});

test.serial("GET /api/passwords/:id/shared-users returns 403 for non-owner (owner-check)", async (t) => {
  const ownerToken = await registerAndGetToken("OwnerSU", "owner-su@example.test", "pw1");
  const otherToken = await registerAndGetToken("OtherUser", "other-su@example.test", "pw2");

  // owner creates a password
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "SharedListTest", username: "owneruser", password: "pw" },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(createRes.statusCode, 200);
  const passwordId = createRes.body.id || createRes.body._id;

  // other (non-owner) attempts to fetch shared-users -> should be forbidden
  const res = await got(`${baseUrl}/api/passwords/${passwordId}/shared-users`, {
    headers: { Authorization: `Bearer ${otherToken}` },
    responseType: "json",
    throwHttpErrors: false,
  });

  t.is(res.statusCode, 403);
  t.is(res.body.message, "Not allowed");
});

test.serial("DELETE /api/passwords/:id returns 500 when DB throws (covers delete catch block)", async (t) => {
  const token = await registerAndGetToken("OwnerErr", "owner-err@example.test", "pw");

  // create a password
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "ToDeleteErr", username: "u", password: "p" },
    headers: { Authorization: `Bearer ${token}` },
    responseType: "json",
  });
  t.is(createRes.statusCode, 200);
  const passwordId = createRes.body.id || createRes.body._id;

  // stub Password.findOneAndDelete to throw
  const origFindOneAndDelete = Password.findOneAndDelete;
  Password.findOneAndDelete = async () => {
    throw new Error("boom-delete");
  };

  try {
    const res = await got.delete(`${baseUrl}/api/passwords/${passwordId}`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "json",
      throwHttpErrors: false,
    });

    t.is(res.statusCode, 500);
    t.truthy(res.body.error && res.body.error.includes("boom-delete"));
  } finally {
    Password.findOneAndDelete = origFindOneAndDelete;
  }
});

test.serial("GET /api/passwords/:id/shared-users returns 500 when DB throws (covers shared-users catch)", async (t) => {
  const ownerToken = await registerAndGetToken("OwnerErr2", "owner-err2@example.test", "pw1");

  // create a password
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "SharedListErr", username: "owneruser", password: "pw" },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(createRes.statusCode, 200);
  const passwordId = createRes.body.id || createRes.body._id;

  // stub Password.findOne to throw
  const origFindOne = Password.findOne;
  Password.findOne = async () => { throw new Error("boom-shared"); };

  try {
    const res = await got(`${baseUrl}/api/passwords/${passwordId}/shared-users`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      responseType: "json",
      throwHttpErrors: false,
    });

    t.is(res.statusCode, 500);
    t.truthy(res.body.message && res.body.message.includes("boom-shared"));
  } finally {
    Password.findOne = origFindOne;
  }
});

test.serial("POST /api/passwords/:id/share returns 'Cannot share with yourself' when owner email included", async (t) => {
  const ownerEmail = `selfshare_${Date.now()}@example.test`;
  const ownerToken = await registerAndGetToken("OwnerSelf", ownerEmail, "pw");

  // create a password
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "SelfShare", username: "u", password: "p" },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(createRes.statusCode, 200);
  const passwordId = createRes.body.id || createRes.body._id;

  const shareRes = await got.post(`${baseUrl}/api/passwords/${passwordId}/share`, {
    json: { emails: [ownerEmail] },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });

  t.is(shareRes.statusCode, 200);
  t.truthy(Array.isArray(shareRes.body.results));
  t.is(shareRes.body.results[0].status, "failed");
  t.is(shareRes.body.results[0].reason, "Cannot share with yourself");
});

test.serial("POST /api/passwords/:id/share returns 'Already shared' when sharing twice", async (t) => {
  const ownerToken = await registerAndGetToken("OwnerDup", "owner-dup@example.test", "pw");
  const recipientEmail = `recipient_dup_${Date.now()}@example.test`;
  // ensure recipient exists
  await registerAndGetToken("Recipient", recipientEmail, "pw2");

  // create a password
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "DupShare", username: "u", password: "p" },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(createRes.statusCode, 200);
  const passwordId = createRes.body.id || createRes.body._id;

  // first share -> should succeed
  const first = await got.post(`${baseUrl}/api/passwords/${passwordId}/share`, {
    json: { emails: [recipientEmail] },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(first.statusCode, 200);
  t.is(first.body.results[0].status, "success");

  // second share -> should return 'Already shared'
  const second = await got.post(`${baseUrl}/api/passwords/${passwordId}/share`, {
    json: { emails: [recipientEmail] },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(second.statusCode, 200);
  t.is(second.body.results[0].status, "failed");
  t.is(second.body.results[0].reason, "Already shared");
});

test.serial("POST /api/passwords/:id/share returns 400 when no emails provided", async (t) => {
  const ownerToken = await registerAndGetToken("OwnerNoEmails", "owner-noemails@example.test", "pw");

  // create a password
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "NoEmails", username: "u", password: "p" },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(createRes.statusCode, 200);
  const passwordId = createRes.body.id || createRes.body._id;

  const shareRes = await got.post(`${baseUrl}/api/passwords/${passwordId}/share`, {
    json: {},
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
    throwHttpErrors: false,
  });

  t.is(shareRes.statusCode, 400);
  t.is(shareRes.body.message, "No emails provided");
});

test.serial("POST /api/passwords/:id/share marks 'User not found' for unknown email", async (t) => {
  const ownerEmail = `owner_nf_${Date.now()}@example.test`;
  const ownerToken = await registerAndGetToken("OwnerNF", ownerEmail, "pw");

  // create a password
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "NFShare", username: "u", password: "p" },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(createRes.statusCode, 200);
  const passwordId = createRes.body.id || createRes.body._id;

  const missingEmail = `doesnotexist_${Date.now()}@example.test`;
  const shareRes = await got.post(`${baseUrl}/api/passwords/${passwordId}/share`, {
    json: { emails: [missingEmail] },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });

  t.is(shareRes.statusCode, 200);
  t.truthy(Array.isArray(shareRes.body.results));
  t.is(shareRes.body.results[0].status, "failed");
  t.is(shareRes.body.results[0].reason, "User not found");
});

test.serial("POST /api/passwords/:id/share returns 404 when password not found", async (t) => {
  const ownerToken = await registerAndGetToken("OwnerNoPass", "owner-nopass@example.test", "pw");
  const fakeId = "000000000000000000000000"; // invalid/nonexistent

  const res = await got.post(`${baseUrl}/api/passwords/${fakeId}/share`, {
    json: { emails: ["someone@example.test"] },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
    throwHttpErrors: false,
  });

  t.is(res.statusCode, 404);
  t.is(res.body.message, "Password not found");
});

test.serial("POST /api/passwords/:id/share returns 403 when requester is not owner", async (t) => {
  const ownerToken = await registerAndGetToken("OwnerX", "owner-x@example.test", "pw");
  const otherToken = await registerAndGetToken("OtherX", "other-x@example.test", "pw2");

  // owner creates a password
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "OwnerOnlyShare", username: "u", password: "p" },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(createRes.statusCode, 200);
  const passwordId = createRes.body.id || createRes.body._id;

  // other user attempts to share -> should be 403 Not owner
  const res = await got.post(`${baseUrl}/api/passwords/${passwordId}/share`, {
    json: { emails: ["someone@example.test"] },
    headers: { Authorization: `Bearer ${otherToken}` },
    responseType: "json",
    throwHttpErrors: false,
  });

  t.is(res.statusCode, 403);
  t.is(res.body.message, "Not owner");
});

test.serial("POST /api/passwords/:id/share returns 500 when User.findOne throws", async (t) => {
  const ownerToken = await registerAndGetToken("OwnerErrU", "owner-err-u@example.test", "pw");
  const recipientEmail = `err_user_${Date.now()}@example.test`;
  // create recipient so we would normally proceed into loop
  await registerAndGetToken("RecipientErr", recipientEmail, "pw2");

  // create a password
  const createRes = await got.post(`${baseUrl}/api/passwords`, {
    json: { title: "ErrUserFind", username: "u", password: "p" },
    headers: { Authorization: `Bearer ${ownerToken}` },
    responseType: "json",
  });
  t.is(createRes.statusCode, 200);
  const passwordId = createRes.body.id || createRes.body._id;

  // stub SharedPassword.findOne to throw (so auth middleware is not affected)
  const origSharedFindOne = SharedPassword.findOne;
  SharedPassword.findOne = async () => { throw new Error("boom-share"); };

  try {
    const res = await got.post(`${baseUrl}/api/passwords/${passwordId}/share`, {
      json: { emails: [recipientEmail] },
      headers: { Authorization: `Bearer ${ownerToken}` },
      responseType: "json",
      throwHttpErrors: false,
    });

    t.is(res.statusCode, 500);
    t.truthy(res.body.message && res.body.message.includes("boom-share"));
  } finally {
    SharedPassword.findOne = origSharedFindOne;
  }
});
