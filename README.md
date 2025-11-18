# PassVault backend

Passvault is a password manager application developed for the second course
of Software Engineering at the Aristotle University of Thessaloniki. The backend
of the application runs on Javascript, with the support of a MongoDB database.

## PREREQUISITES (for backend)

- nodejs npm
- a MongoDB database

## Installing and running Passvault's backend as a developer

- clone the repository:

```
git clone git@github.com:NicKylis/PassVault-backend.git
```

- initiate a MongoDB database

- modify .env.example and add your MongoDB URI and a JWT secret string.

- install the node modules with:

```
npm i
```

- start the backend with:

```
npm run dev
```