import type { ReactNode } from "react";
import Link from "next/link";
import { Avatar, Badge, Group, Text } from "@mantine/core";
import { initials } from "@/lib/people/lifespan";
import classes from "./PersonCard.module.css";

export interface PersonCardData {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  lifespan: string | null;
  kin: string | null;
  isYou: boolean;
}

export function PersonAvatar({
  person,
  size = "md",
}: {
  person: Pick<PersonCardData, "displayName" | "avatarUrl">;
  size?: "md" | "lg" | "xl" | number;
}) {
  return (
    <Avatar src={person.avatarUrl} alt="" size={size} radius={999} color="sepia">
      {initials(person.displayName)}
    </Avatar>
  );
}

/** A person as a link, with how they are related to whoever is signed in. */
export function PersonCard({
  person,
  detail,
  testId,
}: {
  person: PersonCardData;
  /** Extra line, e.g. "adoptive" on a family list. */
  detail?: ReactNode;
  testId?: string;
}) {
  return (
    <Link
      href={`/people/${person.slug}`}
      className={classes.card}
      data-testid={testId ?? `person-${person.slug}`}
    >
      <Group gap="sm" wrap="nowrap" align="center">
        <PersonAvatar person={person} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text fw={600} lh={1.25} className={classes.name}>
            {person.displayName}
          </Text>
          <Text c="dimmed" fz="sm" lh={1.3}>
            {[person.lifespan, detail].filter(Boolean).map((part, index) => (
              <span key={index}>
                {index > 0 && " · "}
                {part}
              </span>
            ))}
          </Text>
        </div>
        {(person.isYou || person.kin) && (
          <Badge variant="light" tt="none" fw={500} style={{ flexShrink: 0 }} data-testid="kin">
            {person.isYou ? "You" : `Your ${person.kin}`}
          </Badge>
        )}
      </Group>
    </Link>
  );
}
