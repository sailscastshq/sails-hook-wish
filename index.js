/** @typedef {'github' | 'google'} Provider */
/**
 * @typedef {Object} WishProvider
 * @property {string} scopeSeparator
 * @property {string[]} scopes
 * @property {string} tokenUrl
 * @property {string} userUrl
 */

/**
 *
 * @param {*} sails
 * @returns
 */
/**
 * wish hook
 *
 * @description :: A hook definition.  Extends Sails by adding shadow routes, implicit actions, and/or initialization logic.
 * @docs        :: https://sailsjs.com/docs/concepts/extending-sails/hooks
 */

module.exports = function defineWishHook(sails) {
  /**
   * @type {Provider}
   */
  let provider

  /**
   * @type {Provider[]}
   */
  const providers = ['github', 'google']
  return {
    /**
     * Runs when this Sails app loads/lifts.
     */
    defaults: {
      /**
       * @type {Object<string, WishProvider>}
       */
      wish: {
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
    initialize: async function () {
      sails.log.info('Initializing custom hook (`wish`)')
      sails.wish = this
    },
    /**
     * Set the Oauth provider
     * @param {Provider} value
     * @returns {Object} wish
     */
    provider: function (value) {
      if (!providers.includes(value))
        throw Error(
          `${value} is not a supported provider. Supported providers are ${providers.join(
            ','
          )}`
        )
      provider = value
      return this
    },
    /**
     * Redirects the user to the OAuth provider for authentication.
     * @returns { string } redirectUrl
     */
    redirect: function () {
      var redirectUrl
      switch (provider) {
        case 'github':
          const githubScope = sails.config.wish[provider].scopes.join(
            sails.config.wish[provider].scopeSeparator
          )
          const githubClientId = sails.config[provider]
            ? sails.config[provider].clientId
            : sails.config.custom[provider].clientId
          redirectUrl = `https://github.com/login/oauth/authorize?scope=${githubScope}&client_id=${githubClientId}`
          break
        case 'google':
          const googleRedirectUrl = sails.config[provider]
            ? sails.config[provider].redirect
            : sails.config.custom[provider].redirect
          const googleClientId = sails.config[provider]
            ? sails.config[provider].clientId
            : sails.config.custom[provider].clientId
          const queryParams = {
            redirect_uri: googleRedirectUrl,
            client_id: googleClientId,
            access_type: 'offline',
            response_type: 'code',
            prompt: 'consent',
            scope: sails.config.wish[provider].scopes.join(
              sails.config.wish[provider].scopeSeparator
            ),
          }
          const qs = new URLSearchParams(queryParams)
          redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?${qs.toString()}`
          break
      }

      return redirectUrl
    },
    /**
     * Get user with a valid OAuth access token
     * @param {{ accessToken: string, idToken?}} option
     * @returns {Promise} user
     */
    userFromToken: async function ({ accessToken, idToken }) {
      if (!accessToken)
        throw Error(`${accessToken} is not a valid access token`)
      var user
      switch (provider) {
        case 'github':
          try {
            user = await sails.helpers.fetch(
              sails.config.wish[provider].userUrl,
              {
                headers: {
                  Authorization: `token ${accessToken}`,
                },
              }
            )
          } catch (error) {
            throw error
          }
          break
        case 'google':
          if (!idToken) throw Error(`${idToken} is not a valid id_token`)
          try {
            try {
              user = await sails.helpers.fetch(
                `${sails.config.wish[provider].userUrl}&access_token=${accessToken}`,
                {
                  headers: {
                    Authorization: `Bearer ${idToken}`,
                  },
                }
              )
            } catch (error) {
              throw error
            }
          } catch (error) {
            throw error
          }
          break
      }
      return user
    },
    /**
     *
     * @param {string} code
     * @returns {Promise} user
     */
    user: async function (code) {
      if (!code) throw Error(`${code} is not a valid code`)

      var user
      const clientId = sails.config[provider]
        ? sails.config[provider].clientId
        : sails.config.custom[provider].clientId
      const clientSecret = sails.config[provider]
        ? sails.config[provider].clientSecret
        : sails.config.custom[provider].clientSecret
      switch (provider) {
        case 'github':
          try {
            const response = await sails.helpers.fetch(
              `${sails.config.wish[provider].tokenUrl}?client_id=${clientId}&client_secret=${clientSecret}&code=${code}`,
              {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                },
              }
            )
            const { access_token: accessToken } = response
            user = await this.userFromToken({ accessToken })
            user.accessToken = accessToken
          } catch (error) {
            throw error
          }
          break
        case 'google':
          const queryParams = {
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: sails.config[provider]
              ? sails.config[provider].redirect
              : sails.config.custom[provider].redirect,
            grant_type: 'authorization_code',
          }
          const qs = new URLSearchParams(queryParams)

          try {
            const response = await sails.helpers.fetch(
              `${sails.config.wish[provider].tokenUrl}?${qs}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-from-urlencoded',
                },
              }
            )

            const { access_token: accessToken, id_token: idToken } = response
            user = await this.userFromToken({ accessToken, idToken })
            user.accessToken = accessToken
            user.idToken = idToken
          } catch (error) {
            throw error
          }
        default:
          break
      }
      return user
    },
  }
}
