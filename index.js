/**
 * wish hook
 *
 * @description :: A hook definition. Extends Sails by adding shadow routes, implicit actions, and/or initialization logic.
 * @docs        :: https://sailsjs.com/docs/concepts/extending-sails/hooks
 */

module.exports = function defineWishHook(sails) {
  let currentProviderKey

  const supportedTypes = ['github', 'google']

  /**
   * Environment variable mappings for each provider type
   */
  const envVarMappings = {
    github: {
      clientId: 'GITHUB_CLIENT_ID',
      clientSecret: 'GITHUB_CLIENT_SECRET',
      redirect: 'GITHUB_CALLBACK_URL',
    },
    google: {
      clientId: 'GOOGLE_CLIENT_ID',
      clientSecret: 'GOOGLE_CLIENT_SECRET',
      redirect: 'GOOGLE_CALLBACK_URL',
    },
  }

  /**
   * Default configurations for each provider type
   */
  const providerDefaults = {
    github: {
      apiVersion: '2026-03-10',
      emailsUrl: 'https://api.github.com/user/emails',
      scopeSeparator: ',',
      scopes: ['user:email'],
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userAgent: 'sails-hook-wish',
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
  }

  /**
   * Get the active provider key (explicitly set or default from config)
   */
  function getProviderKey() {
    if (currentProviderKey) return currentProviderKey
    if (sails.config.wish.provider) return sails.config.wish.provider
    throw Error(
      'No provider specified. Either set a default provider in config/wish.js or call .provider() first.'
    )
  }

  /**
   * Get provider type from key (uses 'type' property or infers from key name)
   */
  function getProviderType(providerKey) {
    const providerConfig = sails.config.wish.providers?.[providerKey] || {}

    // If type is explicitly set, use it
    if (providerConfig.type) {
      if (!supportedTypes.includes(providerConfig.type)) {
        throw Error(
          `'${
            providerConfig.type
          }' is not a supported provider type. Supported types are: ${supportedTypes.join(
            ', '
          )}`
        )
      }
      return providerConfig.type
    }

    // Otherwise, infer from key name
    if (supportedTypes.includes(providerKey)) {
      return providerKey
    }

    throw Error(
      `Cannot infer provider type from key '${providerKey}'. Either use a supported key name (${supportedTypes.join(
        ', '
      )}) or specify 'type' in the provider config.`
    )
  }

  /**
   * Get provider configuration (merged from defaults, env vars, and user config)
   */
  function getProviderConfig(providerKey) {
    const providerType = getProviderType(providerKey)
    const defaults = providerDefaults[providerType]
    const envMapping = envVarMappings[providerType]
    const userConfig = sails.config.wish.providers?.[providerKey] || {}

    // Build config with fallbacks: user config > env vars > defaults
    const config = { ...defaults }

    // Apply environment variable fallbacks
    if (envMapping) {
      if (process.env[envMapping.clientId]) {
        config.clientId = process.env[envMapping.clientId]
      }
      if (process.env[envMapping.clientSecret]) {
        config.clientSecret = process.env[envMapping.clientSecret]
      }
      if (process.env[envMapping.redirect]) {
        config.redirect = process.env[envMapping.redirect]
      }
    }

    // Apply user config (overrides env vars and defaults)
    Object.assign(config, userConfig)

    return config
  }

  /**
   * Build the headers GitHub recommends for authenticated REST API requests.
   */
  function getGithubHeaders(accessToken, config) {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': config.userAgent,
    }

    if (config.apiVersion) {
      headers['X-GitHub-Api-Version'] = config.apiVersion
    }

    return headers
  }

  /**
   * Request and parse one GitHub identity resource.
   */
  async function fetchGithubResource({ accessToken, config, resource, url }) {
    let response

    try {
      response = await fetch(url, {
        headers: getGithubHeaders(accessToken, config),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw Error(
        `GitHub provider request for ${resource} failed: ${message}`,
        { cause: error }
      )
    }

    if (!response.ok) {
      const status = [response.status, response.statusText]
        .filter(Boolean)
        .join(' ')
      throw Error(
        `GitHub provider request for ${resource} failed with ${status}.`
      )
    }

    try {
      return await response.json()
    } catch (error) {
      throw Error(
        `GitHub provider returned an invalid response for ${resource}.`,
        { cause: error }
      )
    }
  }

  /**
   * Select a verified GitHub identity email without exposing the full list.
   */
  function selectGithubEmail(emails) {
    if (!Array.isArray(emails)) {
      throw Error('GitHub provider returned an invalid email address list.')
    }

    const isVerifiedEmail = (entry) =>
      entry?.verified === true &&
      typeof entry.email === 'string' &&
      entry.email.length > 0

    const selectedEmail =
      emails.find(
        (entry) => isVerifiedEmail(entry) && entry.primary === true
      ) || emails.find(isVerifiedEmail)

    if (!selectedEmail) {
      throw Error('GitHub provider returned no verified email address.')
    }

    return selectedEmail.email
  }

  return {
    /**
     * Runs when this Sails app loads/lifts.
     */
    defaults: {
      wish: {
        // Default provider key (optional) - set in config/wish.js for single-provider apps
        provider: undefined,

        // Provider configurations
        providers: {},
      },
    },

    initialize: async function () {
      sails.log.info('Initializing custom hook (`wish`)')
      sails.wish = this
    },

    /**
     * Set the OAuth provider for chained calls
     * @param {string} providerKey - The provider key (e.g., 'github', 'google', or custom key)
     * @returns {Object} wish
     */
    provider: function (providerKey) {
      // Validate that we can resolve this provider
      getProviderType(providerKey)
      currentProviderKey = providerKey
      return this
    },

    /**
     * Redirects the user to the OAuth provider for authentication.
     * @returns {string} redirectUrl
     */
    redirect: function () {
      const providerKey = getProviderKey()
      const providerType = getProviderType(providerKey)
      const config = getProviderConfig(providerKey)

      let redirectUrl
      switch (providerType) {
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

      const providerKey = getProviderKey()
      const providerType = getProviderType(providerKey)
      const config = getProviderConfig(providerKey)

      let user
      switch (providerType) {
        case 'github':
          user = await fetchGithubResource({
            accessToken,
            config,
            resource: 'profile',
            url: config.userUrl,
          })

          if (!user || typeof user !== 'object' || Array.isArray(user)) {
            throw Error('GitHub provider returned an invalid profile.')
          }

          user.email = selectGithubEmail(
            await fetchGithubResource({
              accessToken,
              config,
              resource: 'email addresses',
              url: config.emailsUrl,
            })
          )
          user.emailVerified = true
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

      const providerKey = getProviderKey()
      const providerType = getProviderType(providerKey)
      const config = getProviderConfig(providerKey)

      let user
      switch (providerType) {
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
            const tokenData = /** @type {any} */ (await tokenResponse.json())
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
            const tokenData = /** @type {any} */ (await tokenResponse.json())
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
