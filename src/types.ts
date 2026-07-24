export type PortfolioItem = {
  id: string;
  title: string;
  year: string;
  description: string;
  /** All-caps category label shown under the carousel. */
  category: string;
  /** Garden thumbnail image. */
  image: string;
  /** Slides shown in this project's ProgressiveSmearCarousel overlay. */
  carouselImages: string[];
  link?: string;
};

export type InspectionPointData = {
  id: string;
  portfolioId: string;
  position: [number, number, number];
  label: string;
};

export type InputMode = "desktop" | "touch";

/** Static caption under the carousel (does not change as slides cycle). */
export type CarouselCaption = {
  title: string;
  description: string;
  category: string;
};
