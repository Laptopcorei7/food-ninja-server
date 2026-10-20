const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

// Set env vars needed by the app before any test runs
process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';

beforeAll(async () => {
  // mongod can take over the default 10 s to start on this machine when it is busy.
  // Keep under jest's 30 s testTimeout so a failed start still reports instead of hanging.
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 25000 } });
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop(); // undefined when the start failed
});

// Wipe every collection after each test so tests don't bleed into each other
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
