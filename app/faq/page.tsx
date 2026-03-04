export default function FAQPage() {
  return (
    <main className="space-y-10 pb-16">
      <header className="pt-6">
        <h1 className="text-3xl font-semibold tracking-tight text-white">FAQ</h1>
        <p className="mt-2 max-w-2xl text-neutral-300">
          We’ll expand this section as we lock the lease, pricing, and booking.
        </p>
      </header>

      <section className="grid gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">Where will you be located?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Mishawaka, Indiana. Address will be updated as soon as possible.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">When do you open?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Targeting fall of 2026. We’ll share a launch window after the lease is signed.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">How does 24/7 access work?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Book and pay online. Entry details will be text to your provided phone number 15 minutes before your tee time. Your rented bay will turn on and off automatically, with an option to extend your bay rental provided 15 minutes before the end of your session. 
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">Is there an age requirement? </h2>
          <p className="mt-2 text-sm text-neutral-300">
            Minimum age for at least one member of the group is 18.  
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">How many people are allowed in a bay per booking? </h2>
          <p className="mt-2 text-sm text-neutral-300">
            4 players per bay is the recommended maximum.     
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">How long should I book a bay for? </h2>
          <p className="mt-2 text-sm text-neutral-300">
            2 players can comfortably play nine holes per hour. Want to play 18 with 2 players? Book 2 hours.     
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">What happens if I have trouble with my bay? </h2>
          <p className="mt-2 text-sm text-neutral-300">
            There is a basic troubleshooting guide in each bay, and if all else call the number listed and we'll work to solve your issue.       
          </p>
        </div>
         <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">Is there a dress code? </h2>
          <p className="mt-2 text-sm text-neutral-300">
            While there is no specific dress code, please wear appropriate attire for public atmosphere.        
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">Is there food or beverage available? </h2>
          <p className="mt-2 text-sm text-neutral-300">
            There is no food or beverage sold on site. You're welcome to bring your own food or beverage. No glass bottles are allowed.         
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">Is alcohol allowed? </h2>
          <p className="mt-2 text-sm text-neutral-300">
            There is NO ALCOHOL allowed on premises. There is a zero tolerance policy for consuming alcohol in Tee365.         
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">Will you sell gift cards?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Yes. Gift cards will be available for a discounted rate for a limited time. 
          </p>
        </div>
      </section>
    </main>
  );
}
