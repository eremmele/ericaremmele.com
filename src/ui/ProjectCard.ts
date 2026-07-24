/**
 * Reusable project card matching the Framer "Motion Study" component:
 * bordered frame, media area, monospace title + year footer.
 */
export type ProjectCardData = {
  title: string;
  year: string;
  image: string;
};

export type ProjectCardOptions = {
  onClick?: () => void;
  className?: string;
};

export function createProjectCard(
  data: ProjectCardData,
  options?: ProjectCardOptions,
): HTMLDivElement {
  const card = document.createElement("div");
  card.className = ["project-card", options?.className].filter(Boolean).join(" ");
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.setAttribute("aria-label", `${data.title}, ${data.year}`);

  const media = document.createElement("div");
  media.className = "project-card-media";
  media.style.backgroundImage = `url("${data.image.replace(/"/g, '\\"')}")`;

  const meta = document.createElement("div");
  meta.className = "project-card-meta";

  const title = document.createElement("span");
  title.className = "project-card-title";
  title.textContent = data.title;

  const year = document.createElement("span");
  year.className = "project-card-year";
  year.textContent = data.year;

  meta.append(title, year);
  card.append(media, meta);

  if (options?.onClick) {
    card.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onClick?.();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        options.onClick?.();
      }
    });
  }

  return card;
}
