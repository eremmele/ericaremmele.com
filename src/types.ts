export type PortfolioItem = {
  id: string;
  title: string;
  year: string;
  description: string;
  image: string;
  link?: string;
};

export type InspectionPointData = {
  id: string;
  portfolioId: string;
  position: [number, number, number];
  label: string;
};

export type InputMode = "desktop" | "touch";
