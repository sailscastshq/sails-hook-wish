const crypto = require('crypto')
const base64url = require('base64url').default
module.exports = function generateCodeChallenge() {
  const verifier = base64url(crypto.pseudoRandomBytes(32))
  const challenge = base64url(
    crypto.createHash('sha256').update(verifier).digest()
  )

  return { codeChallenge: challenge, codeVerifier: verifier }
}
