/**
 * wish hook
 *
 * @description :: A hook definition.  Extends Sails by adding shadow routes, implicit actions, and/or initialization logic.
 * @docs        :: https://sailsjs.com/docs/concepts/extending-sails/hooks
 */

module.exports = function defineWishHook(sails) {
  let provider
  const providers = ['github', 'google']
  return {
    /**
     * Runs when this Sails app loads/lifts.
     */
    defaults: {
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
    provider: function (value) {
      console.log
      if (!providers.includes(value))
        throw Error(
          `${value} is not a supported provider. Supported providers are ${providers.join(
            ','
          )}`
        )
      provider = value
      return this
    },
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
          const options = {
            redirect_uri: googleRedirectUrl,
            client_id: googleClientId,
            access_type: 'offline',
            response_type: 'code',
            prompt: 'consent',
            scope: sails.config.wish[provider].scopes.join(
              sails.config.wish[provider].scopeSeparator
            ),
          }
          const qs = new URLSearchParams(options)
          redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?${qs.toString()}`
          break
        default:
          break
      }

      return redirectUrl
    },
    userFromToken: async function (token) {
      if (!token) throw Error(`${token} is not a valid token`)

      const user = await sails.helpers.fetch(
        sails.config.wish[provider].userUrl,
        {
          headers: {
            Authorization: `token ${token}`,
          },
        }
      )
      return user
    },
    user: async function (code) {
      if (!code) throw Error(`${code} is not a valid code`)
      const clientId = sails.config[provider]
        ? sails.config[provider].clientId
        : sails.config.custom[provider].clientId
      const clientSecret = sails.config[provider]
        ? sails.config[provider].clientSecret
        : sails.config.custom[provider].clientSecret

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
        const { access_token } = response
        const user = await this.userFromToken(access_token)
        user.accessToken = access_token
        return user
      } catch (error) {
        throw error
      }
    },
  }
}
