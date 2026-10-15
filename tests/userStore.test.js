'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { UserStore } = require('../services/userStore');

class UsersCollection {
  constructor() {
    this.documents = new Map();
  }

  async insertOne(document) {
    if ([...this.documents.values()].some(user => user.email === document.email)) {
      const error = new Error('Duplicate email');
      error.code = 11000;
      throw error;
    }
    this.documents.set(document._id, { ...document });
  }

  async findOne(filter) {
    return [...this.documents.values()].find(user =>
      Object.entries(filter).every(([key, value]) => user[key] === value)) || null;
  }

  async updateOne(filter, update) {
    const user = await this.findOne(filter);
    if (!user) return { matchedCount: 0 };
    Object.assign(user, update.$set);
    return { matchedCount: 1 };
  }
}

test('Mongo-backed user store persists profiles and never returns password hashes', async () => {
  const collection = new UsersCollection();
  const userStore = new UserStore(collection);
  const profile = await userStore.createUser({
    fullName: 'Test Driver',
    email: ' DRIVER@example.com ',
    password: 'StrongPass123',
    vehicleNickname: 'Solar One',
  });
  assert.equal(profile.email, 'driver@example.com');
  assert.equal(Object.hasOwn(profile, 'passwordHash'), false);
  assert.equal((await userStore.authenticate('DRIVER@example.com', 'StrongPass123')).id, profile.id);
  assert.equal(await userStore.authenticate('driver@example.com', 'wrong-password'), null);

  assert.equal((await userStore.updateProfile(profile.id, {
    fullName: 'Updated Driver',
    vehicleNickname: 'Solar Two',
  })).fullName, 'Updated Driver');
  assert.equal((await userStore.updateTheme(profile.id, 'light')).themePreference, 'light');
  assert.equal((await userStore.updateProfilePicture(profile.id, '/uploads/avatar.png')).profilePictureUrl, '/uploads/avatar.png');
  assert.equal((await userStore.getById(profile.id)).vehicleNickname, 'Solar Two');

  await assert.rejects(
    userStore.createUser({
      fullName: 'Duplicate Driver',
      email: 'driver@example.com',
      password: 'StrongPass123',
      vehicleNickname: 'Solar Three',
    }),
    error => error.code === 'EMAIL_EXISTS',
  );
});
