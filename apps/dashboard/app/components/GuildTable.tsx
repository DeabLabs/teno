import type { SubmitFunction } from '@remix-run/react';
import { Link } from '@remix-run/react';
import type { SerializeFrom } from '@remix-run/node';
import clsx from 'clsx';

import type { Guild as UnserializedGuild } from '@/server/database.server';

type Guild = Pick<
	SerializeFrom<UnserializedGuild> & { voiceServiceKeyCreatedAt?: string },
	'id' | 'guildId' | 'name' | 'voiceServiceKeyCreatedAt' | 'updatedAt'
>;

type GuildTableProps = {
	guilds: Guild[];
	onSubmit?: SubmitFunction;
	loading?: boolean;
};

const GuildTable = ({ guilds }: GuildTableProps) => {
	const mainBg = 'bg-gray-900';
	const mainText = 'text-gray-100';
	const secondaryText = 'text-white';
	const stickyHeader = 'sticky top-16 z-10 bg-gray-900 backdrop-blur backdrop-filter bg-opacity-75';

	return (
		<div className="w-full mb-4 rounded mt-8">
			<div className={clsx('flow-root')}>
				<div className="">
					<div className={clsx('inline-block min-w-full align-middle rounded', mainBg)}>
						<div className="relative">
							<table className="min-w-full table-fixed divide-y divide-gray-800">
								<thead>
									<tr className={clsx(mainText)}>
										<th
											scope="col"
											className={clsx(stickyHeader, 'min-w-[12rem] pr-3 text-left text-sm font-semibold')}
										>
											<div className="flex h-full w-full items-center gap-5">Name</div>
										</th>
										<th scope="col" className={clsx(stickyHeader, 'px-3 py-3.5 text-left text-sm font-semibold')}>
											Guild ID
										</th>
										<th scope="col" className={clsx(stickyHeader, 'px-3 py-3.5 text-left text-sm font-semibold')}>
											Updated At
										</th>
										<th scope="col" className={clsx(stickyHeader, 'px-3 py-3.5 text-left text-sm font-semibold')}>
											Voice Activated
										</th>
										<th scope="col" className={clsx(stickyHeader, 'px-3 py-3.5 text-left text-sm font-semibold')} />
									</tr>
								</thead>
								<tbody className={clsx('divide-y divide-gray-800', mainBg)}>
									{guilds.map((guild) => (
										<tr key={guild.id} className={secondaryText}>
											<td className={clsx('whitespace-nowrap py-4 pr-3 text-sm font-medium', secondaryText)}>
												{guild.name}
											</td>
											<td className="whitespace-nowrap px-3 py-4 text-sm">{guild.guildId}</td>
											<td className="whitespace-nowrap px-3 py-4 text-sm">{guild.updatedAt}</td>
											<td className="whitespace-nowrap px-3 py-4 text-sm">
												{String(!!guild.voiceServiceKeyCreatedAt)}
											</td>
											<td className="whitespace-nowrap px-3 py-4 text-sm">
												<Link
													className="underline underline-offset-2 hover:text-indigo-200"
													to={`/dashboard/servers/${guild.id}`}
												>
													Edit
												</Link>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default GuildTable;
