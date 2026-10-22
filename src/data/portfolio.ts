import type { InspectionPointData, PortfolioItem } from "../types";

const img = (src: string) => ({ kind: "image" as const, src });
const vid = (src: string, poster?: string) => ({ kind: "video" as const, src, poster });

export const portfolioItems: PortfolioItem[] = [
  {
    id: "cyber-product",
    title: "Cybersecurity",
    year: "2021-2026",
    category: "Product Design, Research, Product Management",
    description: "",
    image: "/portfolio/thumbs/cyber-product.webp",
    page: "/portfolio/cyber-product/index.html",
    carouselSlides: [
      img("/portfolio/cyber-product/sspm.webp"),
      img("/portfolio/cyber-product/misc-editorial.webp"),
      img("/portfolio/cyber-product/casb.webp"),
      img("/portfolio/cyber-product/misc-product.webp"),
      img("/portfolio/cyber-product/analytics_editorial.webp"),
      img("/portfolio/cyber-product/casb-editorial.png"),
    ],
    link: "/portfolio/cyber-product/index.html",
  },
  {
    id: "swgwars",
    title: "Digital Experience",
    year: "2025",
    category: "Campaign",
    description: "",
    image: "/portfolio/thumbs/swgwars.webp",
    page: "/portfolio/swgwars/index.html",
    carouselSlides: [
      img("/portfolio/swgwars/swgwars-01-hero.png"),
      vid(
        "/portfolio/swgwars/swgwars-02-screenplay-small-short.webm",
        "/portfolio/swgwars/swgwars-01-hero.png",
      ),
      img("/portfolio/swgwars/swgwars-03-hero.png"),
      img("/portfolio/swgwars/swgwars-04-opponents.png"),
      img("/portfolio/swgwars/swgwars-05-graphics.webp"),
      {
        kind: "embed",
        src: "/portfolio/swgwars/design-system/index.html?embed=carousel",
        title: "Digital Experience",
        poster: "/portfolio/swgwars/view-on-desktop.svg",
      },
    ],
    link: "/portfolio/swgwars/index.html",
  },
  {
    id: "ford",
    title: "Ford",
    year: "2023",
    category: "Social Media Design & Direction",
    description: "",
    image: "/portfolio/thumbs/ford.webp",
    page: "/portfolio/ford/index.html",
    carouselSlides: [
      img("/portfolio/ford/case/social.webp"),
      img("/portfolio/ford/case/gallery.webp"),
    ],
    link: "/portfolio/ford/index.html",
  },
  {
    id: "dollyverse",
    title: "Dollyverse",
    year: "2022",
    category: "Event Design",
    description: "",
    image: "/portfolio/thumbs/dollyverse.webp",
    page: "/portfolio/dollyverse/index.html",
    carouselSlides: [
      img("/portfolio/dollyverse/case/hero.webp"),
      img("/portfolio/dollyverse/case/outdoor.jpg"),
      img("/portfolio/dollyverse/case/entrance.jpg"),
      img("/portfolio/dollyverse/case/portrait.jpg"),
      img("/portfolio/dollyverse/case/performance.jpg"),
    ],
    link: "/portfolio/dollyverse/index.html",
  },
  {
    id: "cyber-brand",
    title: "Cyber Startup",
    year: "2021-2026",
    category: "Creative Direction, Brand Design, Website Design & Development",
    description: "",
    image: "/portfolio/thumbs/cyber-brand.jpg",
    page: "/portfolio/cyber-brand/index.html",
    carouselSlides: [
      vid(
        "/portfolio/cyber-brand/07_walkthrough.webm",
        "/portfolio/cyber-brand/01_homepage.webp",
      ),
      img("/portfolio/cyber-brand/05_composite.webp"),
      img("/portfolio/cyber-brand/01_homepage.webp"),
      img("/portfolio/cyber-brand/02_1440px.webp"),
      img("/portfolio/cyber-brand/03_desktop-1440.webp"),
      img("/portfolio/cyber-brand/04_macbook.webp"),
      img("/portfolio/cyber-brand/06_hero-prod.webp"),
    ],
    link: "/portfolio/cyber-brand/index.html",
  },
];

/** Numbered garden order. Next Project advances through this list and wraps to the first. */
export const inspectionPoints: InspectionPointData[] = [
  {
    id: "point-1",
    portfolioId: "cyber-product",
    position: [-6, 0, -4],
    floatHeight: 2.2,
    label: "Product Design",
  },
  {
    id: "point-2",
    portfolioId: "cyber-brand",
    position: [-5, 0, 3],
    floatHeight: 2.2,
    label: "Creative Direction",
  },
  {
    id: "point-3",
    portfolioId: "swgwars",
    position: [7, 0, -3],
    label: "SWG Wars",
  },
  {
    id: "point-4",
    portfolioId: "ford",
    position: [4, 0, 4],
    label: "Ford",
  },
  {
    id: "point-5",
    portfolioId: "dollyverse",
    position: [9, 0, 6],
    label: "Dollyverse",
  },
];

export function getPortfolioById(id: string): PortfolioItem | undefined {
  return portfolioItems.find((item) => item.id === id);
}
