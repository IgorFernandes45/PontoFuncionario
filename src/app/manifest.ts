import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PontoEscala",
    short_name: "PontoEscala",
    description: "Escala e ponto eletrônico da sua equipe.",
    // O funcionário abre para bater ponto; é a tela que precisa estar a um
    // toque de distância.
    start_url: "/bater-ponto",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#2f5bff",
    lang: "pt-BR",
    icons: [
      {
        src: "/icone.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
