# wish

wish is the OAuth Sails hook you wish(pun intended) exists for Sails. wish provides a simple, convenient way to authenticate with OAuth providers.

## Supported OAuth Providers

- [GitHub](#github)
- [Google](#google)
- [Discord](#discord)

## Installation

In your Sails project run the below command to install wish and it's `node-fetch` peer-dependency:

```sh
npm i --save sails-hook-wish @sailscasts/sails-hook-node-fetch
```

## GitHub

To setup up a GitHub OAuth for your app, `wish` expects the following key and property in either `config/local.js` or `config/custom.js`. For example you can have a development GitHub clientId and clientSecret in `config/local.js`

> Do make sure to get the needed `clientId` and `clientSecret` credentials from GitHub. You can see [here](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) for instructions on how to get those credentials

```js
github: {
    clientId: 'CLIENT_ID',
    clientSecret: 'CLIENT_SECRET',
    redirect: 'http://localhost:1337/auth/callback',
  },
```

You can override this value for production in either `custom.js` or in an environment specific `custom.js`. I personally set this up for https://sailscasts.com to override the `local.js` value so I can have 3 environments with 3 different `clientId`, `clientSecret`, and `redirect` values.

```js
// custom.js
github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirect: 'https://example.com/auth/callback',
  },
```

> Notice I am using environment variables as it's best practice not to commit your secret credentials. In the case of `local.js` that's okay because that file is never committed to version control.

### The redirect

A typical flow is to have a button on your website say like "Sign in with GitHub". A good example can be found [here](https://sailscasts.com/signin)

Clicking that button should call a redirect route you've set in `routes.js`

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
    return sails.wish.provider('github').redirect()
  },
}
```

Notice the redirect is a one-line of code and when this action is called, it will redirect to GitHub to begin the OAuth process.

## The callback

Note the callback URL we set above that `wish` will callback? Let's also implement that starting from the route in `routes.js`

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
    const githubUser = await sails.wish.provider('github').user(code)

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
      // And then update the email change candidate which will be used be used to prompt the user to update their email
      if (!wasCreated && user.email !== githubUser.email) {
        await User.updateOne({ id: user.id }).set({
          emailChangeCandidate: githubUser.email,
        })
      }

      // Checks if the user name has changed since last log in
      // And then update the name if changed
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
      // (This will be persisted when the response is sent.)
      req.session.userId = user.id
      return exits.success('/')
    })
  },
}
```

The above is an actual real world use case of wish in [https://sailscasts.com](https://sailscasts.com). You can perform any business logic you want.

There you have it, a GitHub OAuth flow with just two routes and one line of code each to both redirect to GitHub and get the OAuth user details.

## Google

To setup up a Google OAuth for your app, `wish` expects the following key and property in either `config/local.js` or `config/custom.js`. For example you can have a development Google `clientId` and `clientSecret` in `config/local.js`

> Do make sure to get the needed `clientId` and `clientSecret` credentials from the Google Console. You can see [here](https://developers.google.com/identity/protocols/oauth2) for instructions on how to get those credentials

```js
google: {
    clientId: 'CLIENT_ID',
    clientSecret: 'CLIENT_SECRET',
    redirect: 'http://localhost:1337/auth/callback',
  },
```

You can override this value for production in either `custom.js` or in an environment specific `custom.js`. I personally set this up for https://sailscasts.com to override the `local.js` value so I can have 3 environments with 3 different `clientId`, `clientSecret`, and `redirect` values.

```js
// custom.js
google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirect: 'https://example.com/auth/callback',
  },
```

> Notice I am using environment variables as it's best practice not to commit your secret credentials. In the case of `local.js` that's okay because that file is never committed to version control.

### The redirect

A typical flow is to have a button on your website say like "Sign in with Google". A good example is implemented in [The Boring JavaScript Stack](https://sailscasts.com/boring) mellow template

Clicking that button should call a redirect route you've set in `routes.js`

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
    return sails.wish.provider('google').redirect()
  },
}
```

Notice the redirect is a one-line of code and when this action is called, it will redirect to GitHub to begin the OAuth process.

## The callback

Note the callback URL we set above that `wish` will callback? Let's also implement that starting from the route in `routes.js`

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
    const googleUser = await sails.wish.provider('google').user(code)

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
      // And then update the email change candidate which will be used be used to prompt the user to update their email
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
      // (This will be persisted when the response is sent.)
      req.session.userId = user.id
      return exits.success('/')
    })
  },
}
```

There you have it, a Google OAuth flow with just two routes and one line of code each to both redirect to Google and get the OAuth user details.

## Discord

To setup up a Discord OAuth for your app, `wish` expects the following key and property in either `config/local.js` or `config/custom.js`. For example you can have a development Google `clientId` and `clientSecret` in `config/local.js`

> Do make sure to get the needed `clientId` and `clientSecret` credentials from Discord. You can see [here](https://discordjs.guide/oauth2) for instructions on how to get those credentials

```js
discord: {
    clientId: 'CLIENT_ID',
    clientSecret: 'CLIENT_SECRET',
    redirect: 'http://localhost:1337/auth/callback',
  },
```

You can override this value for production in either `custom.js` or in an environment specific `custom.js`. I personally set this up for https://sailscasts.com to override the `local.js` value so I can have 3 environments with 3 different `clientId`, `clientSecret`, and `redirect` values.

```js
// custom.js
discord: {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    redirect: 'https://example.com/auth/callback',
  },
```

> Notice I am using environment variables as it's best practice not to commit your secret credentials. In the case of `local.js` that's okay because that file is never committed to version control.

### The redirect

A typical flow is to have a button on your website say like "Sign in with Discord" or "Continue with Discord".

Clicking that button should call a redirect route you've set in `routes.js`

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
    return sails.wish.provider('discord').redirect()
  },
}
```

Notice the redirect is a one-line of code and when this action is called, it will redirect to GitHub to begin the OAuth process.

## The callback

Note the callback URL we set above that `wish` will callback? Let's also implement that starting from the route in `routes.js`

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

    // Get the Discord user info
    const discordUser = await sails.wish.provider('discord').user(code)
    User.findOrCreate(
      { or: [{ discordId: discordUser.id }, { email: discordUser.email }] },
      {
        discordId: discordUser.id,
        email: discordUser.email,
        // As at when this was implemented discord doesn't return a name property for the user's name, it only returns username and global_name
        fullName: discordUser.global_name,
        discordAvatarUrl: discordUser.avatar || '',
        discordAccessToken: discordUser.accessToken,
        discordDiscriminator: discordUser.discriminator || '',
        emailStatus: discordUser.verified_email ? 'verified' : 'unverified',
      }
    ).exec(async (error, user, wasCreated) => {
      if (error) throw error

      // Checks if the user email has changed since last log in
      // And then update the email change candidate which will be used be used to prompt the user to update their email
      if (!wasCreated && user.email !== discordUser.email) {
        await User.updateOne({ id: user.id }).set({
          emailChangeCandidate: discordUser.email,
        })
      }

      if (!wasCreated && discordUser.verified_email) {
        await User.updateOne({ id: user.id }).set({
          emailStatus: 'verified',
        })
      }

      if (!wasCreated && user.discordId !== discordUser.id) {
        await User.updateOne({ id: user.id }).set({
          emailChangeCandidate: discordUser.email,
        })
      }

      if (!wasCreated && user.fullName !== discordUser.name) {
        await User.updateOne({ id: user.id }).set({
          fullName: discordUser.global_name,
        })
      }

      if (!wasCreated && user.discordAvatarUrl !== discordUser.avatar) {
        await User.updateOne({ id: user.id }).set({
          discordAvatarUrl: discordUser.avatar || '',
        })
      }

      if (!wasCreated && user.discordAccessToken !== discordUser.accessToken) {
        await User.updateOne({ id: user.id }).set({
          discordAccessToken: discordUser.accessToken,
        })
      }

      // Modify the active session instance.
      // (This will be persisted when the response is sent.)
      req.session.userId = user.id
      return exits.success('/')
    })
  },
}
```

There you have it, a Discord OAuth flow with just two routes and one line of code each to both redirect to Discord and get the OAuth user details.

## License

wish is open-sourced software licensed under the MIT license.
