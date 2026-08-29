import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O indicador do devtools fica em cima do rodape da sidebar no canto
  // inferior esquerdo. So afeta desenvolvimento.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
