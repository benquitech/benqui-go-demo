/** Minúsculas y sin acentos: "Maní" encuentra "mani". */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
