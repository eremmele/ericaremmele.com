import type { InspectionPointData, PortfolioItem } from "../types";

const img = (src: string) => ({ kind: "image" as const, src });
const vid = (src: string, poster?: string) => ({ kind: "video" as const, src, poster });

export const portfolioItems: PortfolioItem[] = [
  {
    id: "cyber-product",
    title: "Cybersecurity",
    year: "2021-2026",
    category: "Product Design, Research, Product Management",
    description:
      "Leading product UX/UI and editorial systems across SWG, DLP, CASB, SSPM, LLMs + AI, and analytics, from feature definition and narrative framing through shipped interfaces and design systems.",
    image: "/portfolio/thumbs/cyber-product.jpg",
    carouselSlides: [
      img("/portfolio/cyber-product/casb.png"),
      img("/portfolio/cyber-product/sspm.png"),
      img("/portfolio/cyber-product/misc-product.png"),
      img("/portfolio/cyber-product/analytics-editorial.png"),
      img("/portfolio/cyber-product/casb-editorial.png"),
      img("/portfolio/cyber-product/misc-editorial.png"),
    ],
    link: "#",
  },
  {
    id: "bridgeway",
    title: "Bridgeway Dental",
    year: "2025-2026",
    category: "Product Design",
    description:
      "Website design for a dental practice: home, full-page flows, design systems, and brand.",
    image: "/portfolio/thumbs/bridgeway.jpg",
    carouselSlides: [
      img("/portfolio/bridgeway/bw_1-website_home.webp"),
      img("/portfolio/bridgeway/bw_2-website_full.webp"),
      img("/portfolio/bridgeway/bw_3-website_full.webp"),
      img("/portfolio/bridgeway/bw_4-website_section.webp"),
      img("/portfolio/bridgeway/bw_5-logo.webp"),
    ],
    link: "#",
  },
  {
    id: "swgwars",
    title: "Digital Experience",
    year: "2025",
    category: "Campaign",
    description:
      "Interactive campaign for a cyber startup: microsite, including screenplay-driven motion, opponent narratives, campaign graphics, and a CRT design library documenting tokens and components. Partnership with VO talent, musical talent, and lead in-house dev team.",
    image: "/portfolio/thumbs/swgwars.jpg",
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
    link: "/portfolio/swgwars/design-system/index.html",
  },
  {
    id: "undrmnd",
    title: "undrmnd",
    year: "2026",
    category: "Design Engineering",
    description:
      "Marketing site and design library for undrmnd: an open-source, counter-algorithmic learning commons. Live at undrmnd.com. App in beta.",
    image: "/portfolio/thumbs/undrmnd.svg",
    carouselSlides: [
      {
        kind: "embed",
        src: "/portfolio/undrmnd/index.html?embed=carousel",
        title: "undrmnd.com",
        poster: "/portfolio/undrmnd/view-on-desktop.svg",
      },
      {
        kind: "embed",
        src: "/portfolio/undrmnd/library.html?embed=carousel",
        title: "undrmnd Design Library",
        poster: "/portfolio/undrmnd/view-on-desktop.svg",
      },
    ],
    link: "https://www.undrmnd.com",
  },
  {
    id: "cyber-brand",
    title: "Cyber Startup",
    year: "2021-2026",
    category: "Creative Direction, Brand Design, Website Design & Development",
    description:
      "Design and creative direction for a cybersecurity brand marketing site, ongoing iterations through the years.",
    image: "/portfolio/thumbs/cyber-brand.jpg",
    carouselSlides: [
      img("/portfolio/cyber-brand/01_homepage.webp"),
      img("/portfolio/cyber-brand/02_1440px.webp"),
      img("/portfolio/cyber-brand/03_desktop-1440.webp"),
      img("/portfolio/cyber-brand/04_macbook.webp"),
      img("/portfolio/cyber-brand/05_composite.webp"),
      img("/portfolio/cyber-brand/06_hero-prod.webp"),
      vid(
        "/portfolio/cyber-brand/07_walkthrough.webm",
        "/portfolio/cyber-brand/01_homepage.webp",
      ),
    ],
    link: "#",
  },
  // Hidden for now — restore by uncommenting + re-adding point-6 / hotkey 6.
  // {
  //   id: "cyber-print",
  //   title: "Print & Typography",
  //   year: "2021-2026",
  //   category: "Brand Design, Print Design, Typography",
  //   description:
  //     "Print systems, typography, and graphic applications for a cybersecurity brand.",
  //   image: "/portfolio/thumbs/cyber-print.jpg",
  //   carouselSlides: [
  //     img("/portfolio/cyber-print/01_print-work.webp"),
  //     img("/portfolio/cyber-print/02_typography.webp"),
  //     img("/portfolio/cyber-print/03_graphic.webp"),
  //   ],
  //   link: "#",
  // },
];

export const inspectionPoints: InspectionPointData[] = [
  {
    id: "point-1",
    portfolioId: "cyber-product",
    position: [-6, 0, -4],
    label: "Product Design",
  },
  {
    id: "point-2",
    portfolioId: "bridgeway",
    position: [0, 0, -10],
    label: "Web Design & Dev",
  },
  {
    id: "point-3",
    portfolioId: "undrmnd",
    position: [7, 0, -3],
    label: "Design Engineering",
  },
  {
    id: "point-4",
    portfolioId: "swgwars",
    position: [4, 0, 4],
    label: "SWG Wars",
  },
  {
    id: "point-5",
    portfolioId: "cyber-brand",
    position: [-5, 0, 3],
    label: "Creative Direction",
  },
];

export function getPortfolioById(id: string): PortfolioItem | undefined {
  return portfolioItems.find((item) => item.id === id);
}
