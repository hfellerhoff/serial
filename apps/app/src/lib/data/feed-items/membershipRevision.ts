let membershipRevision = 0;

export function getFeedItemMembershipRevision() {
  return membershipRevision;
}

export function advanceFeedItemMembershipRevision() {
  membershipRevision += 1;
  return membershipRevision;
}

export function isFeedItemMembershipRevisionStale(
  candidateRevision: number | undefined,
) {
  return (
    candidateRevision !== undefined && candidateRevision < membershipRevision
  );
}
