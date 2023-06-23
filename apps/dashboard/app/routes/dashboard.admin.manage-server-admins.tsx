import type { ActionArgs, LoaderArgs } from '@vercel/remix';
import { json } from '@vercel/remix';
import { redirect } from '@vercel/remix';
import { useActionData, useLoaderData, useNavigation, useSubmit } from '@remix-run/react';
import React, { useEffect } from 'react';
import clsx from 'clsx';
import { Check, CheckSquare, ChevronsUpDown, Loader2, Trash2 } from 'lucide-react';

import { prisma } from '@/server/database.server';
import { checkAuth } from '@/server/auth.utils.server';
import { Button } from '@/components/ui/Button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/Command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';

export const loader = async ({ request }: LoaderArgs) => {
	const user = await checkAuth(request);

	if (!user.admin) {
		return redirect('/dashboard');
	}

	// load a list of all guilds and all users from prisma and return them in json()
	const guilds = await prisma.guild.findMany();
	const users = await prisma.user.findMany();

	return json({
		guilds,
		users,
	});
};

export const action = async ({ request }: ActionArgs) => {
	const user = await checkAuth(request);

	if (!user.admin) {
		return redirect('/dashboard');
	}

	const formData = await request.formData();
	const guildId = formData.get('guildId');
	const userId = formData.get('userId');
	const intent = formData.get('intent');

	if (!guildId || !userId || !intent) {
		return json({}, { status: 400 });
	}

	const guild = await prisma.guild.findUnique({
		where: {
			id: Number(guildId),
		},
	});

	if (!guild) {
		return json({}, { status: 400 });
	}

	const userToAdd = await prisma.user.findUnique({
		where: {
			id: Number(userId),
		},
	});

	if (!userToAdd) {
		return json({}, { status: 400 });
	}

	await prisma.guild.update({
		where: {
			id: Number(guildId),
		},
		data: {
			admins: {
				...(intent === 'add'
					? {
							connect: {
								id: Number(userId),
							},
					  }
					: intent === 'remove'
					? {
							disconnect: {
								id: Number(userId),
							},
					  }
					: {}),
			},
		},
	});

	return json({}, { status: 200 });
};

const List = <T extends { id: number }>({
	title,
	placeholder,
	items,
	filterItem,
	getSelected,
	setSelected,
	selected,
	getLabel,
}: {
	title: string;
	placeholder?: string;
	items: T[];
	setSelected: (item: T | null) => void;
	filterItem: (idAsString: string, search: string) => number;
	selected: T | null;
	getLabel: (item: T) => string;
	getSelected: (item: T) => boolean;
}) => {
	const [open, setOpen] = React.useState(false);

	return (
		<div className="flex flex-col basis-full sm:basis-1/2">
			<h2 className="w-full flex justify-center p-4">{title}</h2>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
						{selected ? getLabel(selected) : placeholder ? placeholder : 'Select item...'}
						<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[400px] p-0">
					<Command filter={filterItem}>
						<CommandInput placeholder={placeholder} />
						<CommandEmpty>No item found.</CommandEmpty>
						<CommandGroup>
							{items.map((item) => (
								<CommandItem
									key={String(item.id)}
									onSelect={(id) => {
										console.log(selected);
										console.log(id, selected?.id, id === String(selected?.id));
										setSelected(id === String(selected?.id) ? null : item);
										setOpen(false);
									}}
									value={String(item.id)}
								>
									<Check className={clsx('mr-2 h-4 w-4', getSelected(item) ? 'opacity-100' : 'opacity-0')} />
									{getLabel(item)}
								</CommandItem>
							))}
						</CommandGroup>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
};

const DashboardServerAdmins = () => {
	const submit = useSubmit();
	const action = useActionData();
	const { state } = useNavigation();
	const { guilds, users } = useLoaderData<typeof loader>();

	const loading = state === 'submitting';

	const [selectedGuild, setSelectedGuild] = React.useState<(typeof guilds)[number] | null>(null);
	const [selectedUser, setSelectedUser] = React.useState<(typeof users)[number] | null>(null);

	useEffect(() => {
		setSelectedGuild(null);
		setSelectedUser(null);
	}, [action]);

	const onSubmit = async (intent: string) => {
		if (!selectedGuild || !selectedUser) {
			return;
		}

		const f = new FormData();
		f.append('intent', intent);
		f.append('guildId', String(selectedGuild.id));
		f.append('userId', String(selectedUser.id));
		submit(f, { method: 'POST', replace: true });
	};

	return (
		<div className="flex h-full w-full gap-2 flex-wrap">
			<div className="flex gap-4 flex-wrap sm:flex-nowrap grow">
				<List
					title="Guilds"
					items={guilds}
					setSelected={setSelectedGuild}
					getLabel={(guild) => `${guild.name ? `${guild.name}#` : ''}${guild.guildId}`}
					getSelected={(guild) => guild === selectedGuild}
					selected={selectedGuild}
					placeholder="Select a guild..."
					filterItem={(idAsString, search) => {
						const id = Number(idAsString);
						const guild = guilds.find((g) => g.id === id);
						if (!guild) {
							return -1;
						}

						const subjects = [guild.name, guild.guildId];
						return (
							(subjects
								.map((s) => s?.toLowerCase()?.indexOf(search.toLowerCase()))
								.filter((f) => typeof f === 'number')
								.shift() ?? -1) + 1
						);
					}}
				/>
				<List
					title="Users"
					items={users}
					setSelected={setSelectedUser}
					getLabel={(user) => user?.name || user.discordId}
					getSelected={(user) => user === selectedUser}
					selected={selectedUser}
					placeholder="Select a user..."
					filterItem={(idAsString, search) => {
						const id = Number(idAsString);
						const user = users.find((u) => u.id === id);
						if (!user) {
							return -1;
						}
						const subjects = [user.name, user.discordId];
						return (
							(subjects
								.map((s) => s?.toLowerCase()?.indexOf(search.toLowerCase()))
								.filter((f) => typeof f === 'number')
								.shift() ?? -1) + 1
						);
					}}
				/>
			</div>
			<div className="flex mt-14 gap-2 basis-full sm:shrink sm:basis-0">
				<Button
					className={clsx('flex w-full sm:w-auto')}
					disabled={!selectedGuild || !selectedUser || loading}
					onClick={() => onSubmit('remove')}
					type="button"
					variant="destructive"
				>
					{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					<Trash2 className="h-4 w-4" />
				</Button>
				<Button
					className={clsx('flex w-full sm:w-auto ')}
					disabled={!selectedGuild || !selectedUser || loading}
					onClick={() => onSubmit('add')}
					type="button"
				>
					{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					<CheckSquare className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
};

export default DashboardServerAdmins;
