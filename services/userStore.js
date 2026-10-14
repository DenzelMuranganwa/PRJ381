'use strict';

const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');

class UserStore {
  constructor(collection = null) {
    this.collection = collection;
    this.users = new Map();
    this.userIdsByEmail = new Map();
  }

  async createUser({ fullName, email, password, vehicleNickname }) {
    const normalizedEmail = normalizeEmail(email);
    if (this.collection) {
      const user = {
        _id: randomUUID(),
        fullName: fullName.trim(),
        email: normalizedEmail,
        passwordHash: await bcrypt.hash(password, 12),
        vehicleNickname: vehicleNickname.trim(),
        themePreference: 'dark',
        profilePictureUrl: '',
      };
      try {
        await this.collection.insertOne(user);
      } catch (error) {
        if (error.code === 11000) {
          const duplicateError = new Error('An account with this email already exists.');
          duplicateError.code = 'EMAIL_EXISTS';
          throw duplicateError;
        }
        throw error;
      }
      return publicProfile(user);
    }

    if (this.userIdsByEmail.has(normalizedEmail)) {
      const error = new Error('An account with this email already exists.');
      error.code = 'EMAIL_EXISTS';
      throw error;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    if (this.userIdsByEmail.has(normalizedEmail)) {
      const error = new Error('An account with this email already exists.');
      error.code = 'EMAIL_EXISTS';
      throw error;
    }

    const user = {
      id: randomUUID(),
      fullName: fullName.trim(),
      email: normalizedEmail,
      passwordHash,
      vehicleNickname: vehicleNickname.trim(),
      themePreference: 'dark',
      profilePictureUrl: '',
    };
    this.users.set(user.id, user);
    this.userIdsByEmail.set(normalizedEmail, user.id);
    return publicProfile(user);
  }

  async authenticate(email, password) {
    if (this.collection) {
      const user = await this.collection.findOne({ email: normalizeEmail(email) });
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
      return publicProfile(user);
    }

    const userId = this.userIdsByEmail.get(normalizeEmail(email));
    const user = userId ? this.users.get(userId) : null;
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
    return publicProfile(user);
  }

  async getById(userId) {
    if (this.collection) {
      const user = await this.collection.findOne({ _id: userId });
      return user ? publicProfile(user) : null;
    }
    const user = this.users.get(userId);
    return user ? publicProfile(user) : null;
  }

  async updateProfile(userId, { fullName, vehicleNickname }) {
    if (this.collection) {
      const result = await this.collection.updateOne(
        { _id: userId },
        { $set: { fullName: fullName.trim(), vehicleNickname: vehicleNickname.trim() } },
      );
      return result.matchedCount ? this.getById(userId) : null;
    }
    const user = this.users.get(userId);
    if (!user) return null;
    user.fullName = fullName.trim();
    user.vehicleNickname = vehicleNickname.trim();
    return publicProfile(user);
  }

  async updateTheme(userId, themePreference) {
    if (this.collection) {
      const result = await this.collection.updateOne({ _id: userId }, { $set: { themePreference } });
      return result.matchedCount ? this.getById(userId) : null;
    }
    const user = this.users.get(userId);
    if (!user) return null;
    user.themePreference = themePreference;
    return publicProfile(user);
  }

  async updateProfilePicture(userId, profilePictureUrl) {
    if (this.collection) {
      const result = await this.collection.updateOne({ _id: userId }, { $set: { profilePictureUrl } });
      return result.matchedCount ? this.getById(userId) : null;
    }
    const user = this.users.get(userId);
    if (!user) return null;
    user.profilePictureUrl = profilePictureUrl;
    return publicProfile(user);
  }
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function publicProfile(user) {
  const { passwordHash, _id, ...profile } = user;
  if (_id) profile.id = _id;
  return profile;
}

module.exports = { UserStore, normalizeEmail };
