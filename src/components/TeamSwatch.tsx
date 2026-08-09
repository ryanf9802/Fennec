import type { TeamPresentation } from '../domain/teamPresentation';

export function TeamSwatch({
  team,
  present = true,
  className = '',
}: {
  team: TeamPresentation;
  present?: boolean;
  className?: string;
}) {
  const primaryColor = present ? team.primaryColor : '#94a3b8';
  const secondaryColor = present ? team.secondaryColor : '#64748b';
  return (
    <span
      aria-hidden="true"
      data-team-number={team.teamNumber}
      className={`inline-block size-2.5 shrink-0 rounded-full border-2 ${className}`}
      style={{
        backgroundColor: primaryColor,
        borderColor: secondaryColor,
        boxShadow: '0 0 0 1px var(--background-elevated)',
      }}
    />
  );
}
