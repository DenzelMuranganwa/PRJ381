'use strict';

const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');

class UserStore {
  constructor() {
    this.users = new Map();
    this.userIdsByEmail = new Map();
  }

  async createUser({ fullName, email, password, vehicleNickname }) {
    const normalizedEmail = normalizeEmail(email);
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
    const userId = this.userIdsByEmail.get(normalizeEmail(email));
    const user = userId ? this.users.get(userId) : null;
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
    return publicProfile(user);
  }

  async getById(userId) {
    const user = this.users.get(userId);
    return user ? publicProfile(user) : null;
  }

  async updateProfile(userId, { fullName, vehicleNickname }) {
    const user = this.users.get(userId);
    if (!user) return null;
    user.fullName = fullName.trim();
    user.vehicleNickname = vehicleNickname.trim();
    return publicProfile(user);
  }

  async updateTheme(userId, themePreference) {
    const user = this.users.get(userId);
    if (!user) return null;
    user.themePreference = themePreference;
    return publicProfile(user);
  }

  async updateProfilePicture(userId, profilePictureUrl) {
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
  const { passwordHash, ...profile } = user;
  return profile;
}

module.exports = { UserStore, normalizeEmail };
