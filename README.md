
  # Coral Health Index Web App

  This is a code bundle for Coral Health Index Web App. The original project is available at https://www.figma.com/design/bkJ1CIRofiZ0H2InNnrT5P/Coral-Health-Index-Web-App.

  ## Running the code

Run `npm i` to install the dependencies.

Run `npm run dev` to start the development server.

### Live data & CORS

NOAA/ERDDAP endpoints do not send permissive CORS headers, so the app routes every request through its own proxy:

- When you run `npm run dev` or `npm run preview`, the Vite server serves `/api/erddap`, which fetches ERDDAP data on the server and adds the appropriate `Access-Control-Allow-Origin` headers. No extra setup needed for local testing.
- For production, deploy a tiny Node handler using `server/erddapProxy.ts` alongside your static assets (for example with Express, a serverless function, or any Node runtime). The front-end is already configured to call `/api/erddap?url=…`; just ensure that path is routed to the proxy handler.

Security tip: the proxy only forwards to a short allowlist of ERDDAP domains. If you need additional sources, update `ALLOW_ORIGINS` in `server/erddapProxy.ts`.

## Mobile Builds with Capacitor

1. Build the web bundle with `npm run build` (outputs to `dist/`).
2. Install Capacitor tooling: `npm install @capacitor/core @capacitor/cli`.
3. Initialize Capacitor shell: `npx cap init "Coral Health Index" com.yourorg.coralhealth --web-dir=dist`.
4. Add native platforms:
   - `npm install @capacitor/ios @capacitor/android`
   - `npx cap add ios`
   - `npx cap add android`
5. Copy the production web assets into the native shells whenever you rebuild:
   - `npm run build`
   - `npx cap copy` (or `npx cap sync` after adding plugins)
6. Open the projects in their respective IDEs:
   - `npx cap open ios`
   - `npx cap open android`
7. Optional native plugins (example):
   - `npm install @capacitor/geolocation @capacitor/filesystem`
   - `npx cap sync`
8. For full-screen maps on mobile, prefer dynamic viewport units (e.g., `height: 100dvh`) instead of `100vh` to avoid iOS Safari layout issues.
  
