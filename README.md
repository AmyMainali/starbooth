# starbooth

A whimsical photobooth that runs entirely in your browser. Take a strip of photos, add doodles,
pick a frame and keep your favourites. No server and no accounts: photos never leave the device.

## Files

- `index.html` page structure
- `style.css` styling
- `script.js` camera, strip composer, doodles and the private "my stars" collection

## Run locally

Open `index.html` in a browser. Some browsers only allow the camera on `https://` or
`http://localhost`, so for local testing run a tiny server in this folder:

```
python3 -m http.server 8000
```

then visit http://localhost:8000.

## Deploy with GitHub Pages

Push the files to a repository, then in **Settings → Pages** choose **Deploy from a branch**,
pick `main` and the `/ (root)` folder, and save. The site appears at
`https://<your-username>.github.io/<repository-name>/`.
