/**
 * encryption.js — Client-side AES-256-GCM encryption via Web Crypto API
 *
 * Option A: Password directly derives the AES key via PBKDF2.
 * vault_version: 1
 *
 * Future migration to Option C (DEK wrapping) will be vault_version: 2 —
 * in that scheme, a random Data Encryption Key (DEK) is generated per vault,
 * the DEK encrypts the data, and the DEK itself is wrapped with the
 * password-derived key. This allows password changes without re-encrypting data.
 *
 * WARNING: If decryption fails, the password is wrong. There is no recovery
 * mechanism — encrypted data cannot be retrieved without the correct password.
 * No password hints, reset codes, or backdoors exist by design.
 */

/**
 * Derives a 256-bit AES-GCM CryptoKey from a password and salt using PBKDF2/SHA-256.
 * @param {string} password - Plaintext password
 * @param {Uint8Array} salt - Random salt (use generateSalt())
 * @param {number} [iterations=600000] - PBKDF2 iteration count
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(password, salt, iterations = 600000) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * @param {string} plaintext
 * @param {CryptoKey} key
 * @returns {Promise<string>} Base64 string containing IV (12 bytes) + ciphertext + auth tag
 */
export async function encrypt(plaintext, key) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a base64 string produced by encrypt().
 * @param {string} encryptedBase64
 * @param {CryptoKey} key
 * @returns {Promise<string>} Plaintext string
 * @throws {Error} If decryption fails (wrong password or corrupted data)
 */
export async function decrypt(encryptedBase64, key) {
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  try {
    const plainBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    throw new Error('DECRYPTION_FAILED');
  }
}

/**
 * Generates a cryptographically random 32-byte salt.
 * @returns {Uint8Array}
 */
export function generateSalt() {
  return window.crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Serialises a salt Uint8Array to a base64 string for storage.
 * @param {Uint8Array} salt
 * @returns {string}
 */
export function saltToBase64(salt) {
  return btoa(String.fromCharCode(...salt));
}

/**
 * Deserialises a base64 string back to a Uint8Array salt.
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToSalt(base64) {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

/**
 * High-level helper: derives key then encrypts a data object as JSON.
 * @param {any} data - Serialisable data object
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} [iterations=600000]
 * @returns {Promise<string>} Encrypted base64 string
 */
export async function encryptData(data, password, salt, iterations = 600000) {
  const key = await deriveKey(password, salt, iterations);
  return encrypt(JSON.stringify(data), key);
}

/**
 * High-level helper: derives key then decrypts and parses a JSON data object.
 * @param {string} encryptedBase64
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} [iterations=600000]
 * @returns {Promise<any>} Parsed data object
 * @throws {Error} 'DECRYPTION_FAILED' if password is wrong or data is corrupted
 */
export async function decryptData(encryptedBase64, password, salt, iterations = 600000) {
  const key = await deriveKey(password, salt, iterations);
  let json;
  try {
    json = await decrypt(encryptedBase64, key);
  } catch {
    throw new Error('DECRYPTION_FAILED');
  }
  return JSON.parse(json);
}
