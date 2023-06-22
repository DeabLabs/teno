import type { ActionArgs, LoaderArgs } from '@vercel/remix';
import { json } from '@vercel/remix';
import { redirect } from '@vercel/remix';
import React, { useState } from 'react';
import invariant from 'tiny-invariant';
import { Form, useActionData, useLoaderData, useNavigate, useNavigation } from '@remix-run/react';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

import { prisma } from '@/server/database.server';
import { checkAuth } from '@/server/auth.utils.server';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/RadioGroup';
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
				voiceService: {
					select: {
						updatedAt: true,
						voiceKey: true,
						service: true,
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
				voiceService: {
					select: {
						apiKey: true,
					},
				},
			},
		});

		invariant(guild, 'Invalid guild or bad permissions');

		const form = await request.formData();
		const parsed = z
			.object({
				service: z.string().default('azure'),
				'service-api': z
					.string()
					.optional()
					.default('')
					.transform((v) => (v === DEFAULT_KEY && guild.voiceService?.apiKey ? guild.voiceService.apiKey : v)),
				'eleven-labs-voice': z.string().optional().default(''),
			})
			.parse(Object.fromEntries(form.entries()));

		const { 'service-api': apiKey, 'eleven-labs-voice': voiceKey, service } = parsed;

		if (!apiKey && voiceKey && service === 'elevenlabs') {
			return json(
				{
					error: undefined,
					errors: {
						serviceapi: 'API Key and Voice Key must both be set when service is Eleven Labs, or empty.',
					},
				},
				{ status: 400 },
			);
		}

		if (apiKey && !voiceKey && service === 'elevenlabs') {
			return json(
				{
					error: undefined,
					errors: {
						'eleven-labs-voice': 'API Key and Voice Key must both be set, or empty.',
					},
				},
				{ status: 400 },
			);
		}

		console.log({ service, apiKey, voiceKey });

		await prisma.guild.update({
			where: {
				id: guildId,
			},
			data: {
				voiceService: {
					upsert: {
						create: {
							service,
							apiKey,
							voiceKey,
						},
						update: {
							service,
							apiKey,
							voiceKey,
						},
					},
					delete:
						(service === 'azure' && !apiKey) || (service === 'elevenlabs' && !apiKey && !voiceKey) ? true : undefined,
				},
			},
		});

		return redirect('/dashboard/servers/');
	} catch (error) {
		console.log(error);
		return json(
			{
				error: 'An error occurred',
				errors: {
					'service-api': undefined,
					'eleven-labs-voice': undefined,
				},
			},
			{ status: 400 },
		);
	}
};

const Server = () => {
	const { guild } = useLoaderData<typeof loader>();
	const navigate = useNavigate();
	const { state } = useNavigation();
	const data = useActionData();

	const [service, setService] = useState<string>(guild?.voiceService?.service ?? 'azure');

	const loading = state === 'submitting';

	return (
		<Form method="post" className="flex flex-col w-full h-full justify-center items-center" data-section="cards">
			<Card className=" min-w-[560px]">
				<CardHeader>
					<CardTitle>{guild.name}</CardTitle>
					<CardDescription>Change how Teno behaves in your Server</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-6">
					<div className="grid gap-2">
						<Label htmlFor="service" className="flex flex-col gap-1">
							<span>Voice Service</span>
							<span className="font-normal leading-snug text-muted-foreground">
								Choose the supported voice provider that you have an API key for
							</span>
						</Label>
						<RadioGroup name="service" id="service" value={service}>
							<div className="flex items-center space-x-2">
								<RadioGroupItem value="azure" id="r1" onClick={(e) => setService(e.currentTarget.value)} />
								<Label htmlFor="r1">Azure</Label>
							</div>
							<div className="flex items-center space-x-2">
								<RadioGroupItem value="elevenlabs" id="r2" onClick={(e) => setService(e.currentTarget.value)} />
								<Label htmlFor="r2">ElevenLabs</Label>
							</div>
						</RadioGroup>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="service-api" className="flex flex-col gap-1">
							<span>Voice API Key</span>
							<span className="font-normal leading-snug text-muted-foreground">
								If provided, this key will allow Teno to speak in your meetings
							</span>
							{!!guild.voiceService && (
								<span className="font-normal leading-snug text-muted-foreground">
									Last Updated: {guild.voiceService.updatedAt}
								</span>
							)}
						</Label>
						<Input
							id="service-api"
							name="service-api"
							placeholder="1a2b3c4d5d6e1a2b3c4d5d6e"
							autoComplete="off"
							type="password"
							defaultValue={guild?.voiceService?.updatedAt ? DEFAULT_KEY : undefined}
						/>
						{data?.errors?.['eleven-labs-api'] && (
							<p className="text-red-200 text-sm leading-tight">{data?.errors?.['service-api']}</p>
						)}
					</div>
					{service === 'elevenlabs' && (
						<div className="grid gap-2">
							<Label htmlFor="eleven-labs-voice" className="flex flex-col gap-1">
								<span>ElevenLabs Voice</span>
								<span className="font-normal leading-snug text-muted-foreground">
									If provided, this key will change Teno's voice to match the your desired voice
								</span>
								{!!guild.voiceService && (
									<span className="font-normal leading-snug text-muted-foreground">
										Last Updated: {guild.voiceService.updatedAt}
									</span>
								)}
							</Label>
							<Input
								name="eleven-labs-voice"
								placeholder="1a2b3c4d5d6e"
								defaultValue={guild?.voiceService?.voiceKey || ''}
								autoComplete="off"
							/>
							{data?.errors?.['eleven-labs-voice'] && (
								<p className="text-red-200 text-sm leading-tight">{data?.errors?.['eleven-labs-voice']}</p>
							)}
						</div>
					)}
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
