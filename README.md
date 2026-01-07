# wish

wish is the OAuth Sails hook you wish (pun intended) exists for Sails. wish provides a simple, convenient way to authenticate with OAuth providers.

## Supported OAuth Providers

- [GitHub](#github)
- [Google](#google)

## Installation

In your Sails project run the below command to install wish:

```sh
npm i sails-hook-wish
```

> **Note:** This package requires Node.js 18+ as it uses native `fetch`.

## Configuration

All wish configuration lives under the `wish` namespace. Create a `config/wish.js` file:

```js
// config/wish.js
module.exports.wish = {
  // Set a default provider for single-provider apps (optional)
  // This allows you to call sails.wish.redirect() without specifying a provider
  provider: 'github',
}
```

Then add your credentials in `config/local.js` (for development) or via environment variables:

```js
// config/local.js
module.exports = {
  wish: {
    github: {
      clientId: 'your-client-id',
      clientSecret: 'your-client-secret',
      redirect: 'http://localhost:1337/auth/callback',
    },
  },
}
```

### Environment Variables

For production, use environment variables. Wish recognizes these common conventions:

| Provider | Environment Variable   | Description             |
| -------- | ---------------------- | ----------------------- |
| GitHub   | `GITHUB_CLIENT_ID`     | OAuth App Client ID     |
| GitHub   | `GITHUB_CLIENT_SECRET` | OAuth App Client Secret |
| Google   | `GOOGLE_CLIENT_ID`     | OAuth Client ID         |
| Google   | `GOOGLE_CLIENT_SECRET` | OAuth Client Secret     |

```js
// config/custom.js (production)
module.exports.wish = {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirect: 'https://example.com/auth/callback',
  },
}
```

## GitHub

To set up GitHub OAuth for your app, get your `clientId` and `clientSecret` credentials from GitHub. See [Creating an OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) for instructions.

```js
// config/local.js
module.exports = {
  wish: {
    github: {
      clientId: 'CLIENT_ID',
      clientSecret: 'CLIENT_SECRET',
      redirect: 'http://localhost:1337/auth/callback',
    },
  },
}
```

### The redirect

A typical flow is to have a button on your website like "Sign in with GitHub". A good example can be found [here](https://sailscasts.com/signin).

Clicking that button should call a redirect route you've set in `routes.js`:

```js
'GET /auth/redirect': 'auth/redirect',
```

Now let's author this `auth/redirect` action:

```js
module.exports = {
  friendlyName: 'Redirect',

  description: 'Redirect auth.',

  inputs: {},

  exits: {
    success: {
      responseType: 'redirect',
    },
  },

  fn: async function () {
    // If you set a default provider in config/wish.js, you can simply call:
    return sails.wish.redirect()

    // Or explicitly specify the provider:
    // return sails.wish.provider('github').redirect()
  },
}
```

### The callback

Note the callback URL we set above that `wish` will callback? Let's also implement that starting from the route in `routes.js`:

```js
'GET /auth/callback': 'auth/callback',
```

```js
module.exports = {
  friendlyName: 'Callback',

  description: 'Callback auth.',

  inputs: {
    code: {
      type: 'string',
      required: true,
    },
  },

  exits: {
    success: {
      responseType: 'redirect',
    },
  },

  fn: async function ({ code }, exits) {
    const req = this.req

    // Get the GitHub user info
    const githubUser = await sails.wish.user(code)
    // Or: await sails.wish.provider('github').user(code)

    User.findOrCreate(
      { githubId: githubUser.id },
      {
        id: sails.helpers.getUuid(),
        githubId: githubUser.id,
        email: githubUser.email,
        name: githubUser.name,
        githubAvatarUrl: githubUser.avatar_url,
        githubAccessToken: githubUser.accessToken,
      }
    ).exec(async (error, user, wasCreated) => {
      if (error) throw error

      // Checks if the user email has changed since last log in
      if (!wasCreated && user.email !== githubUser.email) {
        await User.updateOne({ id: user.id }).set({
          emailChangeCandidate: githubUser.email,
        })
      }

      // Checks if the user name has changed since last log in
      if (!wasCreated && user.name !== githubUser.name) {
        await User.updateOne({ id: user.id }).set({
          name: githubUser.name,
        })
      }

      if (!wasCreated && user.githubAvatarUrl !== githubUser.avatar_url) {
        await User.updateOne({ id: user.id }).set({
          githubAvatarUrl: githubUser.avatar_url,
        })
      }

      if (!wasCreated && user.githubAccessToken !== githubUser.accessToken) {
        await User.updateOne({ id: user.id }).set({
          githubAccessToken: githubUser.accessToken,
        })
      }

      // Modify the active session instance.
      req.session.userId = user.id
      return exits.success('/')
    })
  },
}
```

There you have it, a GitHub OAuth flow with just two routes!

## Google

To set up Google OAuth for your app, get your `clientId` and `clientSecret` credentials from the Google Console. See [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2) for instructions.

```js
// config/local.js
module.exports = {
  wish: {
    google: {
      clientId: 'CLIENT_ID',
      clientSecret: 'CLIENT_SECRET',
      redirect: 'http://localhost:1337/auth/callback',
    },
  },
}
```

### The redirect

A typical flow is to have a button on your website like "Sign in with Google". A good example is implemented in [The Boring JavaScript Stack](https://sailscasts.com/boring) mellow template.

Clicking that button should call a redirect route you've set in `routes.js`:

```js
'GET /auth/redirect': 'auth/redirect',
```

Now let's author this `auth/redirect` action:

```js
module.exports = {
  friendlyName: 'Redirect',

  description: 'Redirect auth.',

  inputs: {},

  exits: {
    success: {
      responseType: 'redirect',
    },
  },

  fn: async function () {
    // If you set provider: 'google' in config/wish.js:
    return sails.wish.redirect()

    // Or explicitly specify the provider:
    // return sails.wish.provider('google').redirect()
  },
}
```

### The callback

Note the callback URL we set above that `wish` will callback? Let's also implement that starting from the route in `routes.js`:

```js
'GET /auth/callback': 'auth/callback',
```

```js
module.exports = {
  friendlyName: 'Callback',

  description: 'Callback auth.',

  inputs: {
    code: {
      type: 'string',
      required: true,
    },
  },

  exits: {
    success: {
      responseType: 'redirect',
    },
  },

  fn: async function ({ code }, exits) {
    const req = this.req

    // Get the Google user info
    const googleUser = await sails.wish.user(code)
    // Or: await sails.wish.provider('google').user(code)

    User.findOrCreate(
      { googleId: googleUser.id },
      {
        id: sails.helpers.getUuid(),
        googleId: googleUser.id,
        email: googleUser.email,
        name: googleUser.name,
        googleAvatarUrl: googleUser.picture,
        googleAccessToken: googleUser.accessToken,
        googleIdToken: googleUser.idToken,
      }
    ).exec(async (error, user, wasCreated) => {
      if (error) throw error

      // Checks if the user email has changed since last log in
      if (!wasCreated && user.email !== googleUser.email) {
        await User.updateOne({ id: user.id }).set({
          emailChangeCandidate: googleUser.email,
        })
      }

      if (!wasCreated && user.name !== googleUser.name) {
        await User.updateOne({ id: user.id }).set({
          name: googleUser.name,
        })
      }

      if (!wasCreated && user.googleAvatarUrl !== googleUser.picture) {
        await User.updateOne({ id: user.id }).set({
          googleAvatarUrl: googleUser.picture,
        })
      }

      if (!wasCreated && user.googleAccessToken !== googleUser.accessToken) {
        await User.updateOne({ id: user.id }).set({
          googleAccessToken: googleUser.accessToken,
        })
      }

      if (!wasCreated && user.googleIdToken !== googleUser.idToken) {
        await User.updateOne({ id: user.id }).set({
          googleIdToken: googleUser.idToken,
        })
      }

      // Modify the active session instance.
      req.session.userId = user.id
      return exits.success('/')
    })
  },
}
```

There you have it, a Google OAuth flow with just two routes!

## Multi-Provider Apps

For apps that support multiple OAuth providers, you can either:

1. **Use the `.provider()` method** to specify which provider to use:

```js
// In your redirect action
fn: async function ({ provider }) {
  return sails.wish.provider(provider).redirect()
}

// In your callback action
fn: async function ({ code, state }) {
  const user = await sails.wish.provider(state).user(code)
}
```

2. **Have separate routes** for each provider:

```js
'GET /auth/github/redirect': 'auth/github-redirect',
'GET /auth/google/redirect': 'auth/google-redirect',
```

## License

wish is open-sourced software licensed under the MIT license.
