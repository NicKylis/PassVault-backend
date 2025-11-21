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

    - Create an account at https://www.mongodb.com/
    - Setup a project and a cluster within the project
    - Copy the URL provided (with the database username and password)

- create an `.env` file and add your MongoDB URI and a JWT secret string, as shown in `.env.example`

- install the node modules with:

```
npm i
```

- start the backend with:

```
npm run dev
```