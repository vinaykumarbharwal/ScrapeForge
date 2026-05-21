from setuptools import setup, find_packages

setup(
    name="scrapeforge_core",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "sqlmodel>=0.0.16",
        "pydantic>=2.6.1",
        "asyncpg>=0.29.0",
        "playwright>=1.42.0",
        "beautifulsoup4>=4.12.3",
        "lxml>=5.1.0",
    ],
)
