# Striking Lab 3D

Striking Lab 3D is an interactive React and Three.js striking-combo visualiser. It lets you build short combat-sport combinations, play them on a 3D fighter model, and compare simple power, speed, and flow ratings.

## Features

- Interactive 3D fighter rendered with Three.js.
- Strike buttons for punches, kicks, elbows, knees, and grappling entries.
- Combo chain builder with up to eight movements.
- Preset classic combinations.
- Power, speed, and flow scoring.
- Local standalone runner for FBX animation assets.

## Project Structure

```text
striking_lab/
├─ index.html
├─ main.jsx
├─ striking-lab-3d-fbx.jsx
├─ striking-lab-3d.jsx
├─ standalone.html
├─ striking-lab-3d-standalone.jsx
├─ public/
│  └─ fbx_files/
├─ package.json
└─ package-lock.json
```

## Run The Vite App

The default Vite app uses `striking-lab-3d-fbx.jsx`, which loads the Mixamo/FBX animation files from `fbx_files/`.

Install dependencies:

```powershell
npm install
```

Start the development server:

```powershell
npm run dev
```

Build for production:

```powershell
npm run build
```

## Standalone FBX Demo

The standalone version loads FBX animation files from `public/fbx_files/`.

On Windows, run:

```powershell
.\open_standalone.bat
```

This starts a local Python web server and opens:

```text
http://localhost:8080/standalone.html
```

The standalone page still expects dependencies to be installed with `npm install`, because it loads React and Three.js from `node_modules`.

## Asset Notes

The FBX files in `public/fbx_files/` are required for the animation viewer. Keeping them under `public/` ensures Vite copies them into production builds for deployment.
