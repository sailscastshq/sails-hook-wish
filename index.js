/** @typedef {'github' | 'google'} Provider */
/**
 * @typedef {Object} WishConfig
 * @property {Provider} [provider] - Default provider for single-provider apps
 * @property {Object} providers - Provider configurations
 * @property {WishProviderConfig} [github] - GitHub credentials (from local.js)
 * @property {WishProviderConfig} [google] - Google credentials (from local.js)
 */

/**
 * @typedef {Object} WishProviderConfig
 * @property {string} clientId
 * @property {string} clientSecret
 * @property {string} redirect
 * @property {string[]} [scopes]
 */

/**
 * @typedef {Object} WishProviderDefaults
 * @property {string} scopeSeparator
 * @property {string[]} scopes
 * @property {string} tokenUrl
 * @property {string} userUrl
 */

/**
 * wish hook
 *
 * @description :: A hook definition. Extends Sails by adding shadow routes, implicit actions, and/or initialization logic.
 * @docs        :: https://sailsjs.com/docs/concepts/extending-sails/hooks
 */

module.exports = function defineWishHook(sails) {
  /**
   * @type {Provider}
   */
  let currentProvider

  /**
   * @type {Provider[]}
   */
  const supportedProviders = ['github', 'google']

  /**
   * Get the active provider (explicitly set or default from config)
   * @returns {Provider}
   */
  function getProvider() {
    if (currentProvider) return currentProvider
    if (sails.config.wish.provider) return sails.config.wish.provider
    throw Error(
      'No provider specified. Either set a default provider in config/wish.js or call .provider() first.'
    )
  }

  /**
   * Get provider configuration (merged from defaults and user config)
   * @param {Provider} providerName
   * @returns {Object}
   */
  function getProviderConfig(providerName) {
    const defaults = sails.config.wish.providers[providerName]
    const credentials = sails.config.wish[providerName] || {}
    return { ...defaults, ...credentials }
  }

  return {
    /**
     * Runs when this Sails app loads/lifts.
     */
    defaults: {
      /**
       * @type {WishConfig}
       */
      wish: {
        // Default provider (optional) - set in config/wish.js for single-provider apps
        provider: undefined,

        // Provider defaults with sensible configurations
        providers: {
          github: {
            scopeSeparator: ',',
            scopes: ['user:email'],
            tokenUrl: 'https://github.com/login/oauth/access_token',
            userUrl: 'https://api.github.com/user',
          },
          google: {
            scopeSeparator: ' ',
            scopes: [
              'https://www.googleapis.com/auth/userinfo.profile',
              'https://www.googleapis.com/auth/userinfo.email',
            ],
            tokenUrl: 'https://oauth2.googleapis.com/token',
            userUrl: 'https://www.googleapis.com/oauth2/v2/userinfo?alt=json',
          },
        },
      },
    },

    initialize: async function () {
      sails.log.info('Initializing custom hook (`wish`)')
      sails.wish = this
    },

    /**
     * Set the OAuth provider for chained calls
     * @param {Provider} value
     * @returns {Object} wish
     */
    provider: function (value) {
      if (!supportedProviders.includes(value))
        throw Error(
          `${value} is not a supported provider. Supported providers are ${supportedProviders.join(
            ', '
          )}`
        )
      currentProvider = value
      return this
    },

    /**
     * Redirects the user to the OAuth provider for authentication.
     * @returns {string} redirectUrl
     */
    redirect: function () {
      const providerName = getProvider()
      const config = getProviderConfig(providerName)

      let redirectUrl
      switch (providerName) {
        case 'github':
          const githubScope = config.scopes.join(config.scopeSeparator)
          redirectUrl = `https://github.com/login/oauth/authorize?scope=${githubScope}&client_id=${config.clientId}`
          break
        case 'google':
          const queryParams = {
            redirect_uri: config.redirect,
            client_id: config.clientId,
            access_type: 'offline',
            response_type: 'code',
            prompt: 'consent',
            scope: config.scopes.join(config.scopeSeparator),
          }
          const qs = new URLSearchParams(queryParams)
          redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?${qs.toString()}`
          break
      }

      return redirectUrl
    },

    /**
     * Get user with a valid OAuth access token
     * @param {{ accessToken: string, idToken?: string }} options
     * @returns {Promise<Object>} user
     */
    userFromToken: async function ({ accessToken, idToken }) {
      if (!accessToken)
        throw Error(`${accessToken} is not a valid access token`)

      const providerName = getProvider()
      const config = getProviderConfig(providerName)

      let user
      switch (providerName) {
        case 'github':
          try {
            const response = await fetch(config.userUrl, {
              headers: {
                Authorization: `token ${accessToken}`,
              },
            })
            user = await response.json()
          } catch (error) {
            throw error
          }
          break
        case 'google':
          if (!idToken) throw Error(`${idToken} is not a valid id_token`)
          try {
            const response = await fetch(
              `${config.userUrl}&access_token=${accessToken}`,
              {
                headers: {
                  Authorization: `Bearer ${idToken}`,
                },
              }
            )
            user = await response.json()
          } catch (error) {
            throw error
          }
          break
      }
      return user
    },

    /**
     * Exchange authorization code for user info
     * @param {string} code
     * @returns {Promise<Object>} user
     */
    user: async function (code) {
      if (!code) throw Error(`${code} is not a valid code`)

      const providerName = getProvider()
      const config = getProviderConfig(providerName)

      let user
      switch (providerName) {
        case 'github':
          try {
            const tokenResponse = await fetch(
              `${config.tokenUrl}?client_id=${config.clientId}&client_secret=${config.clientSecret}&code=${code}`,
              {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                },
              }
            )
            const tokenData = await tokenResponse.json()
            const { access_token: accessToken } = tokenData
            user = await this.userFromToken({ accessToken })
            user.accessToken = accessToken
          } catch (error) {
            throw error
          }
          break
        case 'google':
          const queryParams = {
            code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirect,
            grant_type: 'authorization_code',
          }
          const qs = new URLSearchParams(queryParams)

          try {
            const tokenResponse = await fetch(`${config.tokenUrl}?${qs}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            })
            const tokenData = await tokenResponse.json()
            const { access_token: accessToken, id_token: idToken } = tokenData
            user = await this.userFromToken({ accessToken, idToken })
            user.accessToken = accessToken
            user.idToken = idToken
          } catch (error) {
            throw error
          }
          break
      }
      return user
    },
  }
}
