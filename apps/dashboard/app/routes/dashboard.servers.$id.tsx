import type { ActionArgs, LoaderArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { redirect } from '@remix-run/node';
import React from 'react';
import invariant from 'tiny-invariant';
import { Form, useActionData, useLoaderData, useNavigate, useNavigation } from '@remix-run/react';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

import { prisma } from '@/server/database.server';
import { checkAuth } from '@/server/auth.utils.server';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

const DEFAULT_KEY = 'DEFAULT';

export const loader = async ({ request, params }: LoaderArgs) => {
	try {
		const user = await checkAuth(request);

		const guildId = Number(params.id);
		invariant(guildId && !isNaN(guildId), 'Invalid guild ID');

		const guild = await prisma.guild.findFirst({
			where: {
				id: guildId,
				admins: {
					some: {
						id: user.id,
					},
				},
			},
			include: {
				VoiceServiceKey: {
					select: {
						updatedAt: true,
						profile: true,
					},
				},
			},
		});

		invariant(guild, 'Invalid guild or bad permissions');

		return json({
			guild,
		});
	} catch (error) {
		console.log(error);
		return redirect('/dashboard/servers');
	}
};

export const action = async ({ request, params }: ActionArgs) => {
	try {
		const user = await checkAuth(request);

		const guildId = Number(params.id);
		invariant(guildId && !isNaN(guildId), 'Invalid guild ID');

		const guild = await prisma.guild.findFirst({
			where: {
				id: guildId,
				admins: {
					some: {
						id: user.id,
					},
				},
			},
			include: {
				VoiceServiceKey: {
					select: {
						key: true,
					},
				},
			},
		});

		invariant(guild, 'Invalid guild or bad permissions');

		const form = await request.formData();
		const parsed = z
			.object({
				'eleven-labs-api': z
					.string()
					.optional()
					.default('')
					.transform((v) => (v === DEFAULT_KEY && guild.VoiceServiceKey?.key ? guild.VoiceServiceKey.key : v)),
				'eleven-labs-profile': z.string().optional().default(''),
			})
			.parse(Object.fromEntries(form.entries()));

		const { 'eleven-labs-api': key, 'eleven-labs-profile': profile } = parsed;

		await prisma.guild.update({
			where: {
				id: guildId,
			},
			data: {
				VoiceServiceKey: {
					upsert: {
						create: {
							key,
							profile,
						},
						update: {
							key,
							profile,
						},
					},
					delete: !key,
				},
			},
		});

		return redirect('/dashboard/servers/');
	} catch (error) {
		console.log(error);
		return json({ error: 'An error occurred' }, { status: 400 });
	}
};

const Server = () => {
	const { guild } = useLoaderData<typeof loader>();
	const navigate = useNavigate();
	const { state } = useNavigation();

	const loading = state === 'submitting';

	return (
		<Form method="post" className="flex flex-col w-full h-full justify-center items-center" data-section="cards">
			<Card>
				<CardHeader>
					<CardTitle>{guild.name}</CardTitle>
					<CardDescription>Change how Teno behaves in your Server</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-6">
					<div className="grid gap-2">
						<Label htmlFor="eleven-labs-api" className="flex flex-col gap-1">
							<span>ElevenLabs API Key</span>
							<span className="font-normal leading-snug text-muted-foreground">
								If provided, this key will allow Teno to speak in your meetings
							</span>
							{!!guild.VoiceServiceKey && (
								<span className="font-normal leading-snug text-muted-foreground">
									Last Updated: {guild.VoiceServiceKey.updatedAt}
								</span>
							)}
						</Label>
						<Input
							id="eleven-labs-api"
							name="eleven-labs-api"
							placeholder="1a2b3c4d5d6e1a2b3c4d5d6e"
							autoComplete="off"
							type="password"
							defaultValue={guild?.VoiceServiceKey?.updatedAt ? DEFAULT_KEY : undefined}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="eleven-labs-api" className="flex flex-col gap-1">
							<span>ElevenLabs Voice Profile</span>
							<span className="font-normal leading-snug text-muted-foreground">
								If provided, this key will change Teno's voice to match the your desired profile
							</span>
							{!!guild.VoiceServiceKey && (
								<span className="font-normal leading-snug text-muted-foreground">
									Last Updated: {guild.VoiceServiceKey.updatedAt}
								</span>
							)}
						</Label>
						<Input
							name="eleven-labs-profile"
							placeholder="1a2b3c4d5d6e"
							defaultValue={guild?.VoiceServiceKey?.profile || ''}
							autoComplete="off"
						/>
					</div>
				</CardContent>
				<CardFooter className="justify-between space-x-2">
					<Button variant="ghost" type="button" onClick={() => navigate('/dashboard/servers')} disabled={loading}>
						Cancel
					</Button>
					<Button type="submit" disabled={loading}>
						{loading && <Loader2 className="h-4 w-4 animate-spin" />}
						Submit
					</Button>
				</CardFooter>
			</Card>
		</Form>
	);
};

export default Server;
