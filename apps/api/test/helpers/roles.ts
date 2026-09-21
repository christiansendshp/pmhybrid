import type { App } from 'supertest/types';
import request from 'supertest';

/**
 * Gives an existing project member one of the seeded PROJECT roles by name.
 * Since Roadmap SECURITY-02 a member with no role can read but not write
 * (creating and editing tasks needs `task.write`), so a test that lets an
 * agent or a person write has to grant a role like DEVELOPER or AI_AGENT.
 */
export async function assignProjectRole(
  server: App,
  bearer: string,
  projectId: string,
  actorId: string,
  roleName: string,
): Promise<void> {
  const roles = await request(server)
    .get('/roles')
    .set('Authorization', bearer)
    .expect(200);
  const role = (roles.body as { id: string; name: string; scope: string }[]).find(
    (candidate) => candidate.name === roleName && candidate.scope === 'PROJECT',
  );
  if (!role) {
    throw new Error(`No seeded PROJECT role named ${roleName}`);
  }
  await request(server)
    .post(`/projects/${projectId}/roles`)
    .set('Authorization', bearer)
    .send({ actorId, roleId: role.id })
    .expect(201);
}
