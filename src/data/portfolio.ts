import type { InspectionPointData, PortfolioItem } from "../types";

export const portfolioItems: PortfolioItem[] = [
  {
    id: "motion-study",
    title: "Motion Study",
    year: "2024",
    description: "Motion and interaction study. Replace with process notes and outcomes.",
    image: "/portfolio/motion-study.jpg",
    link: "#",
  },
  {
    id: "project-beta",
    title: "Project Beta",
    year: "2023",
    description: "Another portfolio slot. Add screenshots from Cargo or Figma exports here.",
    image: "/portfolio/placeholder-2.svg",
    link: "#",
  },
  {
    id: "project-gamma",
    title: "Project Gamma",
    year: "2022",
    description: "Third inspection point. Each card in the garden maps to one portfolio entry.",
    image: "/portfolio/placeholder-3.svg",
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
