# Ícones do app

Esta pasta deve conter os ícones referenciados em `tauri.conf.json`
(`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`).

Gere todos a partir de um PNG quadrado (>= 512x512):

```bash
npm run tauri icon caminho/para/logo.png
```

O `tauri:dev` funciona sem eles (usa o ícone padrão embutido); o `tauri:build`
exige os arquivos acima para empacotar.
