'use client'

import { Upload, Link2, Plus, Facebook, CheckCircle } from 'lucide-react'
import { useState } from 'react'

export default function ConnectPage() {
  const [accounts, setAccounts] = useState([
    { id: '1', name: 'My Store', type: 'csv', lastSync: '2 hours ago' }
  ])

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Ad Accounts</h1>
        <p className="text-zinc-500">Manage your connected Meta ad accounts</p>
      </div>

      {/* Current Accounts */}
      <div className="space-y-4 mb-8">
        {accounts.map(account => (
          <div 
            key={account.id}
            className="bg-bg-card border border-border rounded-xl p-5 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-bg-dark rounded-lg flex items-center justify-center">
                {account.type === 'api' ? (
                  <Facebook className="w-6 h-6 text-blue-500" />
                ) : (
                  <Upload className="w-6 h-6 text-zinc-500" />
                )}
              </div>
              <div>
                <h3 className="font-medium">{account.name}</h3>
                <p className="text-sm text-zinc-500">
                  {account.type === 'api' ? 'API Connected' : 'CSV Upload'} • Last sync {account.lastSync}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-sm text-verdict-scale">
                <CheckCircle className="w-4 h-4" />
                Active
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Add Account Options */}
      <h2 className="font-semibold mb-4">Add Account</h2>
      <div className="grid grid-cols-2 gap-4">
        {/* CSV Upload Option */}
        <div className="bg-bg-card border border-border rounded-xl p-6 hover:border-border-light transition-colors cursor-pointer">
          <div className="w-12 h-12 bg-bg-dark rounded-lg flex items-center justify-center mb-4">
            <Upload className="w-6 h-6 text-accent" />
          </div>
          <h3 className="font-medium mb-1">CSV Upload</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Export from Meta Ads Manager and upload here. Quick and easy.
          </p>
          <span className="text-sm text-accent">Available now →</span>
        </div>

        {/* API Connection Option */}
        <div className="bg-bg-card border border-border rounded-xl p-6 opacity-60">
          <div className="w-12 h-12 bg-bg-dark rounded-lg flex items-center justify-center mb-4">
            <Link2 className="w-6 h-6 text-zinc-500" />
          </div>
          <h3 className="font-medium mb-1">Meta API</h3>
          <p className="text-sm text-zinc-500 mb-4">
            Connect directly to Meta for automatic data sync.
          </p>
          <span className="text-sm text-zinc-600">Coming soon</span>
        </div>
      </div>

      {/* Plan Limits */}
      <div className="mt-8 bg-bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-400">Account Limit</span>
          <span className="text-sm font-mono">1 / 3</span>
        </div>
        <div className="w-full h-2 bg-bg-dark rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full" style={{ width: '33%' }} />
        </div>
        <p className="text-xs text-zinc-600 mt-2">
          Pro plan allows up to 3 ad accounts. Upgrade to Agency for 10.
        </p>
      </div>
    </div>
  )
}
