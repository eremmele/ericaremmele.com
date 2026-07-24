import type { InspectionPointData, PortfolioItem } from "../types";

const slides = (ids: number[]): string[] =>
  ids.map((n) => `/portfolio/carousel/slide-${n}.jpg`);

export const portfolioItems: PortfolioItem[] = [
  {
    id: "motion-study",
    title: "Motion Study",
    year: "2024",
    category: "Motion",
    description:
      "Motion and interaction study exploring timing, smear, and depth across a product narrative.",
    image: "/portfolio/motion-study.jpg",
    carouselImages: slides([1, 2, 3, 4, 5, 6, 7]),
    link: "#",
  },
  {
    id: "project-beta",
    title: "Project Beta",
    year: "2023",
    category: "Product Design",
    description:
      "Product design exploration across systems, surfaces, and campaign touchpoints for a growing brand.",
    image: "/portfolio/placeholder-2.svg",
    carouselImages: slides([3, 5, 7, 2, 4, 6, 1]),
    link: "#",
  },
  {
    id: "project-gamma",
    title: "Project Gamma",
    year: "2022",
    category: "Graphic Design",
    description:
      "Graphic design series spanning identity, editorial layouts, and immersive visual storytelling.",
    image: "/portfolio/placeholder-3.svg",
    carouselImages: slides([7, 6, 5, 1, 2, 3, 4]),
    link: "#",
  },
];

export const inspectionPoints: InspectionPointData[] = [
  {
    id: "point-1",
    portfolioId: "motion-study",
    position: [-6, 0, -4],
    label: "Motion Study",
  },
  {
    id: "point-2",
    portfolioId: "project-beta",
    position: [0, 0, -10],
    label: "Beta",
  },
  {
    id: "point-3",
    portfolioId: "project-gamma",
    position: [7, 0, -3],
    label: "Gamma",
  },
];

export function getPortfolioById(id: string): PortfolioItem | undefined {
  return portfolioItems.find((item) => item.id === id);
}
