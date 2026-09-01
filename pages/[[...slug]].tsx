import Head from "next/head";
import Script from "next/script";
import assets from "../cloud/generated-assets.json";

export default function CargoFormCloudShell() {
  return (
    <>
      <Head>
        <title>CargoForm</title>
        <meta name="description" content="CargoForm logistics and export document workspace" />
        <meta name="theme-color" content="#173d3f" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        {assets.css.map((href) => <link key={href} rel="stylesheet" href={href} />)}
      </Head>
      <div id="root" />
      <Script id="cargoform-web" type="module" src={assets.script} strategy="afterInteractive" />
    </>
  );
}
