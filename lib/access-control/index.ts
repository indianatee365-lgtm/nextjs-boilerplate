// Access control integration — wire up when system is defined
// Called at the 15-minute mark when the access code is generated

export interface AccessControlGrant {
  accessCode: string
  bayName: string
  startsAt: Date
  endsAt: Date
}

export async function grantBayAccess(_grant: AccessControlGrant): Promise<void> {
  // TODO: implement when access control API is ready
  // Example: POST to controller API with code, bay, and time window
}
