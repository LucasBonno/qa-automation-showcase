import { createApp } from './src/app.js';

const port = Number(process.env.PORT ?? 4173);

createApp().listen(port, () => {
  console.log(`QuoteLab running at http://localhost:${port}`);
});
