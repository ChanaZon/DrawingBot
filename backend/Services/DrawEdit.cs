using backend.Dtos;

namespace backend.Services;

// Result of an EDIT-mode parse: validated shapes to append plus the indices (into
// the caller's current commands) to delete. The controller maps this to a
// ParseEditResponse. Existing shapes not listed in Remove are left untouched.
public record DrawEdit(IReadOnlyList<DrawCommandDto> Add, IReadOnlyList<int> Remove);
