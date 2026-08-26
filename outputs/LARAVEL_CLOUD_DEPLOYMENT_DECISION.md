# Laravel Cloud deployment decision

Laravel Cloud is designed to deploy Laravel applications from GitHub, GitLab or Bitbucket repositories. It provides separate environments, managed PostgreSQL, object storage, worker compute, generated cloud domains, custom domains/SSL and zero-downtime deployments.

The current CargoForm frontend is React/Vite and its prepared API is Node.js/Express. Therefore the Node API cannot be treated as a native Laravel Cloud application without migration.

## Selected direction

Retain the React/PWA user interface and port the API, background email/notification jobs, authentication, policies, database migrations and storage integration to Laravel. Serve the compiled PWA through the Laravel application so browser requests can use same-origin `/api` endpoints and secure cookies. Use Laravel Cloud Postgres, object storage and worker compute for staging and production.

No deployment should be attempted by disguising the Node service as Laravel or by exposing a localhost API URL in a production frontend.

The repository now includes a root `Dockerfile` for the React/Vite PWA. Configure the Laravel Cloud frontend application to build from the repository root and use the generated application domain for browser access. Configure the API application separately with `server/Dockerfile` and set the frontend build variable `VITE_API_BASE_URL` to the deployed API URL.

## External setup required

1. Sign in to GitHub in the browser and create a private repository named `cargoform` under `kirannetpack-ui`.
2. Grant Laravel Cloud access to that repository.
3. Create a `staging` environment before `production`.
4. Select the deployment region and provision managed PostgreSQL plus private object storage.
5. Add deployment secrets through Laravel Cloud—not GitHub files or chat.
6. Configure the Google production OAuth callback after the staging cloud domain is known.

Official references:

- https://cloud.laravel.com/docs/applications
- https://cloud.laravel.com/docs/environments
- https://cloud.laravel.com/docs/resources/databases/postgres
- https://cloud.laravel.com/docs/deployments
