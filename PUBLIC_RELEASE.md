# Public release checklist

Before pushing this repository to GitHub:

- Create your local `.env` from `.env.example`.
- Keep `.env` untracked.
- Run a secret scan on the repository.
- Remove private memories, conversations, photos and tokens.
- Review `constants/aniPersona.ts` if it contains private lore.
- Review API services for hard-coded credentials.
- If a real API key was ever committed, revoke/rotate it.

This repository is intended to contain the public application code,
not a private Ani Local runtime or personal memory archive.

- Vérifier que `vite.config.ts` n'injecte aucun secret dans le bundle frontend.
